#!/usr/bin/env python3
"""Validate and package an Inscura scraper plugin without executing its JavaScript.

Python 3.9+; standard library only. The manifest/path checks are deterministic;
export discovery is deliberately a limited static check, not a JavaScript parser.
Use explicit CommonJS exports and review response mappings separately. Optional
--node-check asks Node to parse the source only; it does not invoke the plugin.
"""

import argparse
import json
import math
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import unicodedata
import zipfile


METHODS = {
    "media": ("searchMedia", "getMediaDetail"),
    "actor": ("searchActors", "getActorDetail"),
    "tv": ("searchTv", "getTvDetail"),
}
STANDARD_FIELDS = {
    "media": set("code title originalTitle description releaseDate rating portraitCover backdrop "
                 "screenshot previewVideo photos maker collections label genres tags series cast crew roles".split()),
    "actor": set("name description birthday debutDate height measurements nationality gender avatar "
                 "photos skills tags socialLinks".split()),
    "tv": set("title originalTitle tagline description year firstAired lastAired contentRating averageRuntime "
              "rating aliases externalIds tvGenre network tvStudio tvTag tvStatus cast crew trailer poster "
              "backdrop banner logo clearart photos seasons episodes".split()),
}
CONFIG_TYPES = {"text", "password", "number", "boolean", "select", "multiSelect", "radio", "checkboxGroup"}
CUSTOM_TYPES = {"text", "long_text", "url", "single_select", "multi_select"}
OPTIONAL_FILES = ("ATTRIBUTION.md", "README.md", "LICENSE", "LICENSE.txt")
WINDOWS_RESERVED = {"con", "prn", "aux", "nul", "conin$", "conout$"} | {
    prefix + suffix for prefix in ("com", "lpt") for suffix in "123456789¹²³"
}
MAX_FILE_BYTES = 8 * 1024 * 1024  # Deliberate generator limit, not a host limit.
SEMVER = re.compile(r"(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)"
                    r"(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\Z")


class InvalidPlugin(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise InvalidPlugin(message)


def text(value, location):
    require(isinstance(value, str) and bool(value.strip()), location + " must be a nonempty string")
    return value


def object_value(value, location):
    require(isinstance(value, dict), location + " must be an object")
    return value


def list_value(value, location):
    require(isinstance(value, list), location + " must be an array")
    return value


def localized(value, location):
    value = object_value(value, location)
    require(bool(value), location + " must contain at least one language")
    for key, label in value.items():
        text(key, location + " language")
        text(label, location + "." + key)
    require("en" in value or "zh-CN" in value, location + " must include en or zh-CN")


def portable_path(value):
    text(value, "path")
    require(not any(char in value for char in '\\:<>"|?*') and
            not any(ord(char) < 32 for char in value), "nonportable path: " + value)
    parts = value.split("/")
    for part in parts:
        require(part not in ("", ".", "..") and not part.endswith((".", " ")),
                "unsafe path segment: " + value)
        require(part.split(".")[0].casefold() not in WINDOWS_RESERVED,
                "Windows reserved filename: " + value)
    return value


def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key: " + key)
        result[key] = value
    return result


def reject_constant(value):
    raise InvalidPlugin("non-finite JSON number: " + value)


def finite_float(value):
    number = float(value)
    require(math.isfinite(number), "non-finite JSON number: " + value)
    return number


def validate_config(fields):
    keys = set()
    for field in list_value(fields, "config"):
        field = object_value(field, "config item")
        key = text(field.get("key"), "config.key")
        require(key not in keys, "duplicate config key: " + key)
        keys.add(key)
        require(key.casefold() != "provider", "provider selection belongs in providers, not config")
        kind = text(field.get("type"), "config.type")
        require(kind in CONFIG_TYPES, "unsupported config type: " + kind)
        localized(field.get("label"), "config." + key + ".label")
        require(type(field.get("required", False)) is bool, "config.required must be boolean")
        for prop in ("placeholder", "help"):
            if field.get(prop) is not None:
                localized(field[prop], "config." + key + "." + prop)
        for bound in ("min", "max"):
            if field.get(bound) is not None:
                number = field[bound]
                require(type(number) in (int, float) and math.isfinite(number),
                        "config." + bound + " must be a finite number")
        if field.get("min") is not None and field.get("max") is not None:
            require(field["min"] <= field["max"], "config.min must not exceed max")
        options = field.get("options")
        if kind in {"select", "multiSelect", "radio", "checkboxGroup"}:
            require(bool(list_value(options, "config.options")), "config.options must not be empty")
        if options is not None:
            seen = set()
            for option in list_value(options, "config.options"):
                option = object_value(option, "config option")
                value = option.get("value")
                require(type(value) in (str, int, float, bool), "option.value must be a scalar")
                encoded = json.dumps(value)
                require(encoded not in seen, "duplicate config option: " + encoded)
                seen.add(encoded)
                localized(option.get("label"), "option.label")
        default = field.get("default")
        if default is not None:
            if kind in {"multiSelect", "checkboxGroup"}:
                list_value(default, "config.default")
            elif kind in {"text", "password"}:
                require(isinstance(default, str), "text/password default must be a string")
            elif kind == "number":
                require(type(default) in (int, float) and math.isfinite(default),
                        "number default must be finite")
            elif kind == "boolean":
                require(type(default) is bool, "boolean default must be boolean")
            if kind == "password":
                require(default == "", "never distribute password/token defaults")


def validate_manifest(manifest):
    manifest = object_value(manifest, "manifest")
    plugin_id = text(manifest.get("id"), "id")
    require(re.fullmatch(r"[A-Za-z0-9_-]+", plugin_id) is not None, "id may only contain ASCII letters, digits, - and _")
    require(plugin_id.casefold() != "inscura-scraper", "inscura-scraper is reserved for the application")
    portable_path(plugin_id)
    text(manifest.get("name"), "name")
    version = text(manifest.get("version"), "version")
    require(SEMVER.fullmatch(version) is not None, "version must use semantic version syntax, e.g. 1.0.0")
    version_core = version.split("+", 1)[0]
    if "-" in version_core:
        for identifier in version_core.split("-", 1)[1].split("."):
            require(not (identifier.isdigit() and len(identifier) > 1 and identifier.startswith("0")),
                    "numeric prerelease identifiers must not have leading zeros")
    require(type(manifest.get("apiVersion")) is int and manifest["apiVersion"] == 1,
            "apiVersion must be integer 1")
    for key in ("description", "author", "homepage", "updateUrl"):
        if manifest.get(key) is not None:
            require(isinstance(manifest[key], str), key + " must be a string")
    for key in ("homepage", "updateUrl"):
        if manifest.get(key):
            require(manifest[key].startswith("https://"), key + " must use HTTPS")
    require("managedByApp" not in manifest, "managedByApp is host-owned and must not appear in a manifest")
    capabilities = list_value(manifest.get("capabilities"), "capabilities")
    require(bool(capabilities), "capabilities must not be empty")
    require(all(isinstance(item, str) and item in METHODS for item in capabilities),
            "supported capabilities are media, actor and tv; this host does not support game")
    require(len(set(capabilities)) == len(capabilities), "capabilities contains duplicates")
    entry = portable_path(manifest.get("entry", "index.js"))
    require(entry.lower().endswith(".js"), "entry must be one JavaScript bundle ending in .js")
    providers = object_value(manifest.get("providers"), "providers")
    require(set(providers) <= set(METHODS), "providers contains an unsupported capability")
    provider_ids = {}
    for capability in METHODS:
        entries = list_value(providers.get(capability, []), "providers." + capability)
        require(not entries or capability in capabilities, "providers declared for an undeclared capability: " + capability)
        require(bool(entries) or capability not in capabilities, "providers." + capability + " must not be empty")
        seen = set()
        for provider in entries:
            provider = object_value(provider, "provider")
            provider_id = text(provider.get("id"), "provider.id")
            require(provider_id == provider_id.strip(), "provider.id must not contain surrounding whitespace")
            require(provider_id not in seen, "duplicate provider.id: " + provider_id)
            seen.add(provider_id)
            localized(provider.get("label"), "provider.label")
        provider_ids[capability] = seen
    validate_config(manifest.get("config", []))
    scrape_fields = manifest.get("scrapeFields")
    if scrape_fields is not None:
        scrape_fields = object_value(scrape_fields, "scrapeFields")
        require(set(scrape_fields) <= set(METHODS), "scrapeFields contains an unsupported capability")
        for capability, fields in scrape_fields.items():
            fields = list_value(fields, "scrapeFields." + capability)
            require(not fields or capability in capabilities, "scrapeFields declared for undeclared capability")
            seen = set()
            seen_keys = set()
            for field in fields:
                field = object_value(field, "scrape field")
                field_id = text(field.get("id"), "scrapeFields.id")
                key = text(field.get("key"), "scrapeFields.key")
                provider = text(field.get("provider"), "scrapeFields.provider")
                require(provider in provider_ids[capability], "scrapeFields.provider must match a declared provider: " + provider)
                require((provider, field_id) not in seen, "duplicate scrape field ID for provider: " + field_id)
                seen.add((provider, field_id))
                require((provider, key) not in seen_keys, "duplicate scrape field key for provider: " + key)
                seen_keys.add((provider, key))
                kind = text(field.get("kind"), "scrapeFields.kind")
                require(kind in {"standard", "custom"}, "scrapeFields.kind must be standard or custom")
                field_type = text(field.get("fieldType"), "scrapeFields.fieldType")
                localized(field.get("label"), "scrapeFields.label")
                require(type(field.get("translatable", True)) is bool, "translatable must be boolean")
                if kind == "standard":
                    require(field_id == key and field_id in STANDARD_FIELDS[capability],
                            "unsupported standard field or id/key mismatch: " + capability + "." + field_id)
                    if capability == "media" and field_id == "originalTitle":
                        require(field.get("translatable") is False, "media.originalTitle must set translatable=false")
                else:
                    require(field_type in CUSTOM_TYPES, "unsupported custom fieldType: " + field_type)
    return entry


def mask_js_literals(source):
    """Mask comments and quoted literals, preserving offsets; regex literals are not parsed.

    This intentionally does not attempt to recognize all JavaScript grammar. It is
    suitable for the skill's explicit export convention, not proof of semantics.
    """
    pattern = r"//[^\r\n]*|/\*[\s\S]*?\*/|'(?:\\[\s\S]|[^'\\])*'|\"(?:\\[\s\S]|[^\"\\])*\"|`(?:\\[\s\S]|[^`\\])*`"
    return re.sub(pattern, lambda match: "".join("\n" if ch == "\n" else " " for ch in match[0]), source)


def brace_body(source, opening):
    depth = 0
    for index in range(opening, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[opening + 1:index]
    raise InvalidPlugin("could not locate the export object's closing brace; use explicit CommonJS exports")


def top_level_members(body):
    depth = 0
    start = 0
    members = []
    for index, char in enumerate(body):
        if char in "({[":
            depth += 1
        elif char in ")}]":
            depth -= 1
        elif char == "," and depth == 0:
            members.append(body[start:index].strip())
            start = index + 1
    members.append(body[start:].strip())
    return members


def callable_expression(expression, code):
    expression = expression.strip()
    if re.match(r"(?:async\s+)?function\b", expression):
        return True
    if re.match(r"(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>", expression):
        return True
    if re.fullmatch(r"[A-Za-z_$][\w$]*", expression):
        name = re.escape(expression)
        return bool(re.search(r"\bfunction\s+" + name + r"\s*\(", code) or
                    re.search(r"\b(?:var|let|const)\s+" + name + r"\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)", code))
    return False


def validate_exports(source, capabilities):
    code = mask_js_literals(source)
    require(not re.search(r"\brequire\s*\(|\bimport\s*(?:\(|\{|\*|[A-Za-z_$])|\bexport\s+(?:default|const|function|class|\{)", code),
            "entry must be a standalone CommonJS bundle without require/import/export dependencies")
    exports = set()
    objects = []
    assignment = r"(?:\bmodule\s*\.\s*exports(?:\s*\.\s*default)?|\bexports\s*\.\s*default)\s*=\s*"
    for match in re.finditer(assignment + r"(\{|[A-Za-z_$][\w$]*)", code):
        value = match[1]
        if value == "{":
            objects.append(brace_body(code, match.start(1)))
        else:
            binding = re.search(r"\b(?:var|let|const)\s+" + re.escape(value) + r"\s*=\s*(\{)", code)
            if binding:
                objects.append(brace_body(code, binding.start(1)))
    for body in objects:
        for member in top_level_members(body):
            method = re.match(r"(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(", member)
            prop = re.match(r"([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)", member)
            if method:
                exports.add(method[1])
            elif prop and callable_expression(prop[2], code):
                exports.add(prop[1])
            elif callable_expression(member, code):
                exports.add(member)
    for match in re.finditer(r"(?:\bmodule\s*\.\s*exports|\bexports)\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*([^;]+)", code):
        if callable_expression(match[2], code):
            exports.add(match[1])
    required = {name for capability in capabilities for name in METHODS[capability]}
    require(required <= exports, "static export check could not confirm callable methods: " + ", ".join(sorted(required - exports)) +
            "; use explicit module.exports = { name: function (...) { ... } } or named function references")
    return exports


def is_link_or_reparse_point(path):
    # Windows junctions are reparse points but are not always reported as symlinks.
    attributes = getattr(path.lstat(), "st_file_attributes", 0)
    return path.is_symlink() or bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def inspect_tree(root):
    require(not is_link_or_reparse_point(root), "plugin root must not be a symlink or Windows reparse point")
    require(root.is_dir(), "plugin directory does not exist: " + str(root))
    files = set()
    for current, directories, filenames in os.walk(root, followlinks=False):
        folded = set()
        for name in sorted(directories + filenames):
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            portable_path(relative)
            require(not is_link_or_reparse_point(path), "symlinks / Windows reparse points are not allowed: " + relative)
            kind = path.lstat().st_mode
            require(stat.S_ISREG(kind) or stat.S_ISDIR(kind), "special files are not allowed: " + relative)
            normalized = unicodedata.normalize("NFC", name).casefold()
            require(normalized not in folded, "case/Unicode filename collision: " + relative)
            folded.add(normalized)
            if stat.S_ISREG(kind):
                files.add(relative)
            if name.casefold() == "manifest.json":
                require(relative == "manifest.json", "conflicting or incorrectly named manifest: " + relative)
    require("manifest.json" in files, "manifest.json must be at the plugin directory root")
    return files


def read_file(root, relative):
    path = root.joinpath(*relative.split("/"))
    require(not is_link_or_reparse_point(path) and path.is_file(), "not a regular file: " + relative)
    require(path.stat().st_size <= MAX_FILE_BYTES, "file exceeds the tool's 8 MiB limit: " + relative)
    return path.read_bytes()


def node_check(source):
    node = shutil.which("node")
    require(node is not None, "--node-check requires Node.js on PATH; install it or run without this optional check")
    # NODE_OPTIONS can preload executable code even for --check. Remove Node's
    # environment options; parse from stdin to avoid local package type settings.
    environment = {key: value for key, value in os.environ.items() if not key.upper().startswith("NODE_")}
    result = subprocess.run([node, "--check", "--input-type=commonjs"], input=source,
                            text=True, capture_output=True, timeout=20, env=environment)
    require(result.returncode == 0, "Node syntax check failed:\n" + result.stderr[:4000])


def validate(root, check_node=False):
    files = inspect_tree(root)
    manifest_bytes = read_file(root, "manifest.json")
    manifest = json.loads(manifest_bytes.decode("utf-8"), object_pairs_hook=no_duplicate_keys,
                          parse_constant=reject_constant, parse_float=finite_float)
    entry = validate_manifest(manifest)
    require(entry in files, "entry file is missing (check exact filename case): " + entry)
    entry_bytes = read_file(root, entry)
    source = entry_bytes.decode("utf-8")
    exports = validate_exports(source, manifest["capabilities"])
    if check_node:
        node_check(source)
    payload = {"manifest.json": manifest_bytes, entry: entry_bytes}
    for relative in OPTIONAL_FILES:
        if relative in files:
            payload[relative] = read_file(root, relative)
    print("PASS: manifest, providers, scrape-field declarations, portable paths and static export checks")
    print("Capabilities: " + ", ".join(manifest["capabilities"]))
    print("Exports detected: " + ", ".join(sorted(exports)))
    print("Node syntax: " + ("passed (parse only)" if check_node else "not checked; use --node-check if Node.js is available"))
    print("LIMIT: no plugin code or network requests executed; QuickJS behavior and response mappings remain unverified")
    if "test" not in exports:
        print("NOTE: add test(ctx) to check service reachability when the user activates the plugin")
    ignored = sorted(files - set(payload))
    if ignored:
        print("Excluded from ZIP by allowlist: " + ", ".join(ignored))
    return payload


def package(root, output, payload):
    require(output.suffix.lower() == ".zip", "output filename must end in .zip")
    require(output.parent.is_dir(), "output parent directory must already exist")
    require(not output.is_symlink(), "output must not be a symlink")
    require(root.resolve() not in (output.resolve(), *output.resolve().parents),
            "write the ZIP outside the plugin source directory")
    created = False
    try:
        with output.open("xb") as stream:
            created = True
            with zipfile.ZipFile(stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for name in sorted(payload):
                    info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.create_system = 3
                    info.external_attr = (stat.S_IFREG | 0o644) << 16
                    archive.writestr(info, payload[name])
    except BaseException:
        if created:
            output.unlink(missing_ok=True)
        raise
    print("Created: " + str(output.resolve()))
    print("ZIP files: " + ", ".join(sorted(payload)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "package"):
        command = commands.add_parser(name)
        command.add_argument("plugin_dir", type=Path)
        if name == "package":
            command.add_argument("output_zip", type=Path)
        command.add_argument("--node-check", action="store_true", help="also parse JavaScript with node --check (never run it)")
    args = parser.parse_args()
    try:
        payload = validate(args.plugin_dir, args.node_check)
        if args.command == "package":
            package(args.plugin_dir, args.output_zip, payload)
    except (InvalidPlugin, OSError, UnicodeError, ValueError, subprocess.TimeoutExpired) as error:
        print("ERROR: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
