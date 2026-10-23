// Static plugin checks: manifest contract, portable package tree, CommonJS
// export convention and syntax. Nothing here executes plugin code.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { parseStrictJson } from "./json.mjs";
import { CAPABILITIES, METHODS, STANDARD_FIELDS } from "./fields.mjs";

export const CONFIG_TYPES = new Set(["text", "password", "number", "boolean", "select", "multiSelect", "radio", "checkboxGroup"]);
export const OPTION_TYPES = new Set(["select", "multiSelect", "radio", "checkboxGroup"]);
export const CUSTOM_TYPES = new Set(["text", "long_text", "url", "single_select", "multi_select"]);
export const OPTIONAL_FILES = ["ATTRIBUTION.md", "README.md", "LICENSE", "LICENSE.txt"];
export const HOST_CONFIG_KEYS = new Set(["language"]);
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const WINDOWS_RESERVED = new Set(["con", "prn", "aux", "nul", "conin$", "conout$"]);
for (const prefix of ["com", "lpt"]) for (const suffix of "123456789¹²³") WINDOWS_RESERVED.add(prefix + suffix);
const SEMVER = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export class InvalidPlugin extends Error {}

function require(condition, message) {
    if (!condition) throw new InvalidPlugin(message);
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isFinite = (value) => typeof value === "number" && Number.isFinite(value);
// Explicit null is invalid wherever the host applies a default only to omitted keys.
const get = (object, key, fallback) => (Object.hasOwn(object, key) ? object[key] : fallback);

function text(value, location) {
    require(typeof value === "string" && value.trim() !== "", location + " must be a nonempty string");
    return value;
}

function objectValue(value, location) {
    require(isObject(value), location + " must be an object");
    return value;
}

function listValue(value, location) {
    require(Array.isArray(value), location + " must be an array");
    return value;
}

function localized(value, location) {
    objectValue(value, location);
    require(Object.keys(value).length > 0, location + " must contain at least one language");
    for (const [key, label] of Object.entries(value)) {
        text(key, location + " language");
        text(label, location + "." + key);
    }
    require("en" in value || "zh-CN" in value, location + " must include en or zh-CN");
}

export function portablePath(value) {
    text(value, "path");
    require(!/[\\:<>"|?*\x00-\x1f]/.test(value), "nonportable path: " + value);
    for (const part of value.split("/")) {
        require(part !== "" && part !== "." && part !== ".." && !/[. ]$/.test(part), "unsafe path segment: " + value);
        require(!WINDOWS_RESERVED.has(part.split(".")[0].toLowerCase()), "Windows reserved filename: " + value);
    }
    return value;
}

function validateConfig(fields) {
    const keys = new Set();
    for (let field of listValue(fields, "config")) {
        field = objectValue(field, "config item");
        const key = text(field.key, "config.key");
        require(!keys.has(key), "duplicate config key: " + key);
        keys.add(key);
        require(key.toLowerCase() !== "provider", "provider selection belongs in providers, not config");
        require(!HOST_CONFIG_KEYS.has(key), "config key " + key + " is injected by the host; read ctx.config." + key + " instead of declaring it");
        const kind = text(field.type, "config.type");
        require(CONFIG_TYPES.has(kind), "unsupported config type: " + kind);
        localized(field.label, "config." + key + ".label");
        require(typeof get(field, "required", false) === "boolean", "config.required must be boolean");
        for (const prop of ["placeholder", "help"]) {
            if (field[prop] != null) localized(field[prop], "config." + key + "." + prop);
        }
        for (const bound of ["min", "max"]) {
            if (field[bound] != null) require(isFinite(field[bound]), "config." + bound + " must be a finite number");
        }
        if (field.min != null && field.max != null) require(field.min <= field.max, "config.min must not exceed max");
        const options = field.options;
        if (OPTION_TYPES.has(kind)) require(listValue(options, "config.options").length > 0, "config.options must not be empty");
        if (options != null) {
            const seen = new Set();
            for (let option of listValue(options, "config.options")) {
                option = objectValue(option, "config option");
                require(["string", "number", "boolean"].includes(typeof option.value), "option.value must be a scalar");
                const encoded = JSON.stringify(option.value);
                require(!seen.has(encoded), "duplicate config option: " + encoded);
                seen.add(encoded);
                localized(option.label, "option.label");
            }
        }
        const fallback = field.default;
        if (fallback != null) {
            if (kind === "multiSelect" || kind === "checkboxGroup") listValue(fallback, "config.default");
            else if (kind === "text" || kind === "password") require(typeof fallback === "string", "text/password default must be a string");
            else if (kind === "number") require(isFinite(fallback), "number default must be finite");
            else if (kind === "boolean") require(typeof fallback === "boolean", "boolean default must be boolean");
            if (kind === "password") require(fallback === "", "never distribute password/token defaults");
        }
    }
}

export function validateManifest(manifest) {
    objectValue(manifest, "manifest");
    const id = text(manifest.id, "id");
    require(/^[A-Za-z0-9_-]+$/.test(id), "id may only contain ASCII letters, digits, - and _");
    require(id.toLowerCase() !== "inscura-scraper", "inscura-scraper is reserved for the application");
    portablePath(id);
    text(manifest.name, "name");
    const version = text(manifest.version, "version");
    require(SEMVER.test(version), "version must use semantic version syntax, e.g. 1.0.0");
    const core = version.split("+")[0];
    if (core.includes("-")) {
        for (const identifier of core.slice(core.indexOf("-") + 1).split(".")) {
            require(!(/^[0-9]+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")),
                "numeric prerelease identifiers must not have leading zeros");
        }
    }
    require(manifest.apiVersion === 1, "apiVersion must be integer 1");
    for (const key of ["description", "author", "homepage", "updateUrl"]) {
        if (manifest[key] != null) require(typeof manifest[key] === "string", key + " must be a string");
    }
    for (const key of ["homepage", "updateUrl"]) {
        if (manifest[key]) require(manifest[key].startsWith("https://"), key + " must use HTTPS");
    }
    require(!("managedByApp" in manifest), "managedByApp is host-owned and must not appear in a manifest");
    const capabilities = listValue(manifest.capabilities, "capabilities");
    require(capabilities.length > 0, "capabilities must not be empty");
    require(capabilities.every((item) => CAPABILITIES.includes(item)),
        "supported capabilities are media, actor and tv; this host does not support game");
    require(new Set(capabilities).size === capabilities.length, "capabilities contains duplicates");
    const entry = portablePath(get(manifest, "entry", "index.js"));
    require(entry.toLowerCase().endsWith(".js"), "entry must be one JavaScript bundle ending in .js");
    const providers = objectValue(manifest.providers, "providers");
    require(Object.keys(providers).every((key) => CAPABILITIES.includes(key)), "providers contains an unsupported capability");
    const providerIds = {};
    for (const capability of CAPABILITIES) {
        const entries = listValue(get(providers, capability, []), "providers." + capability);
        require(entries.length === 0 || capabilities.includes(capability), "providers declared for an undeclared capability: " + capability);
        require(entries.length > 0 || !capabilities.includes(capability), "providers." + capability + " must not be empty");
        const seen = new Set();
        for (let provider of entries) {
            provider = objectValue(provider, "provider");
            const providerId = text(provider.id, "provider.id");
            require(providerId === providerId.trim(), "provider.id must not contain surrounding whitespace");
            require(!seen.has(providerId), "duplicate provider.id: " + providerId);
            seen.add(providerId);
            localized(provider.label, "provider.label");
        }
        providerIds[capability] = seen;
    }
    validateConfig(get(manifest, "config", []));
    if (manifest.scrapeFields != null) {
        const scrapeFields = objectValue(manifest.scrapeFields, "scrapeFields");
        require(Object.keys(scrapeFields).every((key) => CAPABILITIES.includes(key)), "scrapeFields contains an unsupported capability");
        for (const [capability, list] of Object.entries(scrapeFields)) {
            listValue(list, "scrapeFields." + capability);
            require(list.length === 0 || capabilities.includes(capability), "scrapeFields declared for undeclared capability");
            const seen = new Set();
            const seenKeys = new Set();
            for (let item of list) {
                item = objectValue(item, "scrape field");
                const fieldId = text(item.id, "scrapeFields.id");
                const key = text(item.key, "scrapeFields.key");
                const provider = text(item.provider, "scrapeFields.provider");
                require(providerIds[capability].has(provider), "scrapeFields.provider must match a declared provider: " + provider);
                require(!seen.has(provider + "\0" + fieldId), "duplicate scrape field ID for provider: " + fieldId);
                seen.add(provider + "\0" + fieldId);
                require(!seenKeys.has(provider + "\0" + key), "duplicate scrape field key for provider: " + key);
                seenKeys.add(provider + "\0" + key);
                const kind = text(item.kind, "scrapeFields.kind");
                require(kind === "standard" || kind === "custom", "scrapeFields.kind must be standard or custom");
                const fieldType = text(item.fieldType, "scrapeFields.fieldType");
                localized(item.label, "scrapeFields.label");
                require(typeof get(item, "translatable", true) === "boolean", "translatable must be boolean");
                if (kind === "standard") {
                    require(fieldId === key && STANDARD_FIELDS[capability].has(fieldId),
                        "unsupported standard field or id/key mismatch: " + capability + "." + fieldId);
                    if (capability === "media" && fieldId === "originalTitle") {
                        require(item.translatable === false, "media.originalTitle must set translatable=false");
                    }
                } else {
                    require(CUSTOM_TYPES.has(fieldType), "unsupported custom fieldType: " + fieldType);
                }
            }
        }
    }
    return entry;
}

// Masks comments and quoted literals (offsets preserved). Regex literals are not
// parsed: this supports the explicit export convention, not arbitrary JavaScript.
function maskLiterals(source) {
    return source.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|'(?:\\[\s\S]|[^'\\])*'|"(?:\\[\s\S]|[^"\\])*"|`(?:\\[\s\S]|[^`\\])*`/g,
        (match) => match.replace(/[^\n]/g, " "));
}

function braceBody(source, opening) {
    let depth = 0;
    for (let index = opening; index < source.length; index += 1) {
        if (source[index] === "{") depth += 1;
        else if (source[index] === "}") {
            depth -= 1;
            if (depth === 0) return source.slice(opening + 1, index);
        }
    }
    throw new InvalidPlugin("could not locate the export object's closing brace; use explicit CommonJS exports");
}

function topLevelMembers(body) {
    const members = [];
    let depth = 0;
    let start = 0;
    for (let index = 0; index < body.length; index += 1) {
        const char = body[index];
        if ("({[".includes(char)) depth += 1;
        else if (")}]".includes(char)) depth -= 1;
        else if (char === "," && depth === 0) {
            members.push(body.slice(start, index).trim());
            start = index + 1;
        }
    }
    members.push(body.slice(start).trim());
    return members;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function callableExpression(expression, code) {
    expression = expression.trim();
    if (/^(?:async\s+)?function\b/.test(expression)) return true;
    if (/^(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(expression)) return true;
    if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
        const name = escapeRegExp(expression);
        return new RegExp("\\bfunction\\s+" + name + "\\s*\\(").test(code) ||
            new RegExp("\\b(?:var|let|const)\\s+" + name + "\\s*=\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*=>)").test(code);
    }
    return false;
}

export function validateExports(source, capabilities) {
    const code = maskLiterals(source);
    require(!/\brequire\s*\(|\bimport\s*(?:\(|\{|\*|[A-Za-z_$])|\bexport\s+(?:default|const|function|class|\{)/.test(code),
        "entry must be a standalone CommonJS bundle without require/import/export dependencies");
    const exports = new Set();
    const objects = [];
    const assignment = /(?:\bmodule\s*\.\s*exports(?:\s*\.\s*default)?|\bexports\s*\.\s*default)\s*=\s*(\{|[A-Za-z_$][\w$]*)/g;
    for (const match of code.matchAll(assignment)) {
        const opening = match.index + match[0].length - match[1].length;
        if (match[1] === "{") objects.push(braceBody(code, opening));
        else {
            const binding = new RegExp("\\b(?:var|let|const)\\s+" + escapeRegExp(match[1]) + "\\s*=\\s*\\{").exec(code);
            if (binding) objects.push(braceBody(code, binding.index + binding[0].length - 1));
        }
    }
    for (const body of objects) {
        for (const member of topLevelMembers(body)) {
            const method = /^(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/.exec(member);
            const prop = /^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]*)/.exec(member);
            if (method) exports.add(method[1]);
            else if (prop && callableExpression(prop[2], code)) exports.add(prop[1]);
            else if (callableExpression(member, code)) exports.add(member);
        }
    }
    for (const match of code.matchAll(/(?:\bmodule\s*\.\s*exports|\bexports)\s*\.\s*([A-Za-z_$][\w$]*)\s*=\s*([^;]+)/g)) {
        if (callableExpression(match[2], code)) exports.add(match[1]);
    }
    const required = capabilities.flatMap((capability) => METHODS[capability]);
    const missing = required.filter((name) => !exports.has(name)).sort();
    require(missing.length === 0, "static export check could not confirm callable methods: " + missing.join(", ") +
        "; use explicit module.exports = { name: function (...) { ... } } or named function references");
    return exports;
}

export function syntaxCheck(source, filename) {
    try {
        vm.compileFunction(source, ["module", "exports"], { filename });
    } catch (error) {
        throw new InvalidPlugin("JavaScript syntax error in " + filename + ": " + error.message);
    }
}

export function inspectTree(root) {
    let rootStat;
    try {
        rootStat = fs.lstatSync(root);
    } catch {
        throw new InvalidPlugin("plugin directory does not exist: " + root);
    }
    require(!rootStat.isSymbolicLink(), "plugin root must not be a symlink or Windows reparse point");
    require(rootStat.isDirectory(), "plugin directory does not exist: " + root);
    const files = new Set();
    const walk = (directory) => {
        const folded = new Set();
        for (const name of fs.readdirSync(directory).sort()) {
            const full = path.join(directory, name);
            const relative = path.relative(root, full).split(path.sep).join("/");
            portablePath(relative);
            const stat = fs.lstatSync(full);
            require(!stat.isSymbolicLink(), "symlinks / Windows reparse points are not allowed: " + relative);
            require(stat.isFile() || stat.isDirectory(), "special files are not allowed: " + relative);
            const normalized = name.normalize("NFC").toLowerCase();
            require(!folded.has(normalized), "case/Unicode filename collision: " + relative);
            folded.add(normalized);
            if (name.toLowerCase() === "manifest.json") {
                require(relative === "manifest.json", "conflicting or incorrectly named manifest: " + relative);
            }
            if (stat.isFile()) files.add(relative);
            else walk(full);
        }
    };
    walk(root);
    require(files.has("manifest.json"), "manifest.json must be at the plugin directory root");
    return files;
}

function readFile(root, relative) {
    const full = path.join(root, ...relative.split("/"));
    const stat = fs.lstatSync(full);
    require(stat.isFile() && !stat.isSymbolicLink(), "not a regular file: " + relative);
    require(stat.size <= MAX_FILE_BYTES, "file exceeds the tool's 8 MiB limit: " + relative);
    return fs.readFileSync(full);
}

export function readManifest(root) {
    return parseStrictJson(readFile(root, "manifest.json").toString("utf8"), "manifest.json");
}

// Returns everything pack needs; throws InvalidPlugin on the first violation.
export function validatePlugin(root) {
    const files = inspectTree(root);
    const manifestBytes = readFile(root, "manifest.json");
    const manifest = parseStrictJson(manifestBytes.toString("utf8"), "manifest.json");
    const entry = validateManifest(manifest);
    require(files.has(entry), "entry file is missing (check exact filename case): " + entry);
    const entryBytes = readFile(root, entry);
    const source = new TextDecoder("utf-8", { fatal: true }).decode(entryBytes);
    const exports = validateExports(source, manifest.capabilities);
    syntaxCheck(source, entry);
    const payload = new Map([["manifest.json", manifestBytes], [entry, entryBytes]]);
    for (const name of OPTIONAL_FILES) if (files.has(name)) payload.set(name, readFile(root, name));
    const notes = [];
    if (!exports.has("test")) notes.push("add test(ctx) so enabling the plugin checks reachability and configuration");
    if (/TODO\(inscura\)/.test(source)) notes.push("index.js still contains TODO(inscura) markers from the scaffold");
    const ignored = [...files].filter((name) => !payload.has(name)).sort();
    return { manifest, entry, source, exports, payload, ignored, notes };
}
