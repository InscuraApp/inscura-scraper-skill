#!/usr/bin/env node
// Inscura scraper plugin toolkit. Node.js 18+, no dependencies.
// Run `node tools/inscura.mjs help` for usage.

import fs from "node:fs";
import { parseArgs } from "node:util";
import { CAPABILITIES, METHODS, STANDARD_FIELD_META } from "./lib/fields.mjs";
import { parseStrictJson, JsonError } from "./lib/json.mjs";
import { InvalidPlugin, validatePlugin } from "./lib/manifest.mjs";
import { InvalidResult, checkResult, checkTestResult, checkTvScope } from "./lib/results.mjs";
import { SandboxError, findUnserializable, invoke, loadPlugin, methodInfo, missingMethods } from "./lib/sandbox.mjs";
import { packPlugin } from "./lib/pack.mjs";
import { scaffold } from "./lib/scaffold.mjs";

const USAGE = `Inscura scraper plugin toolkit

Usage: node tools/inscura.mjs <command> [options]

  new <dir> --id <id> --name <name> --capabilities <list> --provider <id:Label> [options]
      Create a plugin skeleton with config presets.
      --base-url <url>        API base URL (required unless --self-hosted)
      --auth <mode>           none | header:<Name> | query:<param> | bearer   (default none)
      --key-url <url>         Where users obtain the API key (shown in settings help)
      --self-hosted           Add a "Server URL" setting (users run their own server)
      --images <on|off>       Add image toggle: use on; off only for explicit user preference
      --timeout               Add a "Request timeout (seconds)" setting
      --fields <cap=a,b>      Standard scrape fields to declare (repeatable), e.g. tv=title,description
      --homepage <url> --description <text> --author <text> --version <semver>

  validate <dir>
      Manifest, package tree, export and syntax checks, plus a sandbox load.

  run <dir> <method> [input] (--fixtures <file> | --live | --record <file>) [options]
      Execute one plugin method in a QuickJS-like sandbox and print its raw JSON result.
      input: keyword for search*, id for get*Detail, nothing for test.
      --provider <id>  --year <n>  --scope <json|@file>  --language <tag>  --locale <tag>
      --config <json|@file>   Plugin settings (keep secrets in a file outside the plugin dir)
      --check                 Validate the result shape (and TV scope when --scope is given)
      --expect-error          Succeed only if the method throws a clean Error
      --out <file>            Write the result JSON to a file instead of stdout

  check <media|actor|tv> <search|detail> <file> [--provider <id>]
      Check a saved raw result JSON file.

  pack <dir> [out.zip] [--allow-todo]
      Validate, refresh the README config table and write the installable ZIP.

  fields [media|actor|tv]
      List standard scrape fields and the result property that carries each one.
`;

const COMMON = { help: { type: "boolean", short: "h" } };
const OPTIONS = {
    new: {
        id: { type: "string" }, name: { type: "string" }, capabilities: { type: "string" }, provider: { type: "string" },
        "base-url": { type: "string" }, auth: { type: "string" }, "key-url": { type: "string" },
        "self-hosted": { type: "boolean" }, images: { type: "string" }, timeout: { type: "boolean" },
        fields: { type: "string", multiple: true }, homepage: { type: "string" }, description: { type: "string" },
        author: { type: "string" }, version: { type: "string" },
    },
    validate: {},
    run: {
        provider: { type: "string" }, year: { type: "string" }, scope: { type: "string" }, language: { type: "string" },
        locale: { type: "string" }, config: { type: "string" }, fixtures: { type: "string" }, live: { type: "boolean" },
        record: { type: "string" }, check: { type: "boolean" }, "expect-error": { type: "boolean" }, out: { type: "string" },
    },
    check: { provider: { type: "string" } },
    pack: { "allow-todo": { type: "boolean" } },
    fields: {},
    help: {},
};

class UsageError extends Error {}

const out = (line = "") => process.stdout.write(line + "\n");
const err = (line = "") => process.stderr.write(line + "\n");

function jsonArgument(value, label) {
    if (value === undefined) return undefined;
    const source = value.startsWith("@") ? fs.readFileSync(value.slice(1), "utf8") : value;
    return parseStrictJson(source, label);
}

function positionals(list, min, max, usage) {
    if (list.length < min || list.length > max) throw new UsageError("usage: node tools/inscura.mjs " + usage);
    return list;
}

function cmdNew(args, values) {
    const [dir] = positionals(args, 1, 1, "new <dir> --id ... (see help)");
    const { target, manifest } = scaffold(dir, {
        id: values.id, name: values.name, capabilities: values.capabilities, provider: values.provider,
        baseUrl: values["base-url"], auth: values.auth, keyUrl: values["key-url"], selfHosted: values["self-hosted"],
        images: values.images, timeout: values.timeout, fields: values.fields, homepage: values.homepage,
        description: values.description, author: values.author, version: values.version,
    });
    out("Created " + target);
    out("  manifest.json  capabilities: " + manifest.capabilities.join(", ") + "; settings: " +
        (manifest.config.map((field) => field.key).join(", ") || "none"));
    out("  index.js       helpers + method stubs marked TODO(inscura)");
    out("  README.md      config table is regenerated by `pack`");
    out("Next: implement the TODO(inscura) stubs, add fixtures, then `run --check` each method and `pack`.");
    return 0;
}

function cmdValidate(args) {
    const [dir] = positionals(args, 1, 1, "validate <dir>");
    const result = validatePlugin(dir);
    const plugin = loadPlugin(result.source, result.entry);
    const missing = missingMethods(plugin.exports, result.manifest.capabilities);
    if (missing.length) throw new InvalidPlugin("sandbox load did not export callable methods: " + missing.join(", "));
    out("PASS " + result.manifest.id + "@" + result.manifest.version + ": manifest, providers, scrape fields, config, paths, exports, syntax, sandbox load");
    out("Capabilities: " + result.manifest.capabilities.join(", "));
    out("Exports: " + [...result.exports].sort().join(", "));
    out("ZIP would contain: " + [...result.payload.keys()].sort().join(", "));
    if (result.ignored.length) out("Not packaged (allowlist): " + result.ignored.join(", "));
    for (const note of result.notes) out("NOTE: " + note);
    out("LIMIT: static + load checks only; use `run` to exercise methods and the Inscura app for real installation.");
    return 0;
}

function cmdCheck(args, values) {
    const [capability, operation, file] = positionals(args, 3, 3, "check <media|actor|tv> <search|detail> <file>");
    if (!CAPABILITIES.includes(capability)) throw new UsageError("capability must be media, actor or tv");
    if (operation !== "search" && operation !== "detail") throw new UsageError("operation must be search or detail");
    const data = parseStrictJson(fs.readFileSync(file, "utf8"), file);
    checkResult(capability, operation, data, values.provider);
    out("PASS " + capability + " " + operation + ": field allowlist, identities, types, nulls, ranges, nested values");
    return 0;
}

async function cmdRun(args, values) {
    const [dir, method, input] = positionals(args, 2, 3, "run <dir> <method> [input] (--fixtures <file> | --live | --record <file>)");
    const modes = [values.fixtures !== undefined, Boolean(values.live), values.record !== undefined].filter(Boolean).length;
    if (modes !== 1) throw new UsageError("choose exactly one of --fixtures <file>, --live or --record <file>");
    const fetchMode = values.fixtures !== undefined ? "fixtures" : values.record !== undefined ? "record" : "live";
    const { capability, operation } = methodInfo(method);
    if (operation === "detail" && !input) throw new UsageError(method + " needs an id argument");
    const validated = validatePlugin(dir);
    const plugin = loadPlugin(validated.source, validated.entry);
    const year = values.year === undefined ? undefined : Number(values.year);
    if (year !== undefined && !Number.isInteger(year)) throw new UsageError("--year must be an integer");
    const tvScope = jsonArgument(values.scope, "--scope");
    if (tvScope !== undefined && method !== "getTvDetail") throw new UsageError("--scope only applies to getTvDetail");
    const config = jsonArgument(values.config, "--config") ?? {};
    if (config === null || typeof config !== "object" || Array.isArray(config)) throw new UsageError("--config must be a JSON object");

    const outcome = await invoke({
        plugin, manifest: validated.manifest, method, input, provider: values.provider, config,
        language: values.language, locale: values.locale, year, tvScope, fetchMode, fixtures: values.fixtures,
        log: (level, message) => err("[plugin " + level + "] " + message),
    });
    const { http, redact } = outcome;
    const label = method + (input ? " " + JSON.stringify(input) : "") + " [" + fetchMode + ", " + http.requests.length + " request(s)]";
    for (const request of http.requests) err("  " + request);
    if (fetchMode === "record") {
        fs.writeFileSync(values.record, JSON.stringify({ requests: http.recorded }, null, 2) + "\n");
        err("Recorded " + http.recorded.length + " response(s) to " + values.record + " (review and trim before keeping it)");
    }
    const problems = [];
    if (http.unmatched.length) problems.push("requests without a fixture: " + http.unmatched.join("; "));

    if (!outcome.ok) {
        if (values["expect-error"] && problems.length === 0) {
            if (!outcome.errorIsError) problems.push("threw a non-Error value; throw new Error(message)");
            if (outcome.secrets.some((secret) => String(outcome.error?.message ?? "").includes(secret))) problems.push("error message contains a secret");
            if (problems.length === 0) {
                out("PASS (expected error) " + label + ": " + outcome.errorMessage);
                return 0;
            }
        }
        err("FAIL " + label + ": " + outcome.errorMessage);
        for (const problem of problems) err("  - " + problem);
        return 1;
    }

    const problem = findUnserializable(outcome.value);
    if (problem) problems.push("result is not plain JSON: " + problem);
    const serialized = problem ? "null" : JSON.stringify(outcome.value ?? null, null, 2);
    if (outcome.secrets.some((secret) => serialized.includes(secret))) problems.push("result contains a configured secret");
    const value = JSON.parse(serialized);
    if (values["expect-error"]) problems.push("expected an error but the method succeeded");
    if (operation === "test" && value && value.ok === false) problems.push("test(ctx) reported ok: false" + (value.error ? " (" + value.error + ")" : ""));
    if (values.check && !problem) {
        try {
            if (operation === "test") checkTestResult(value);
            else {
                const allowedSearchProviders = operation === "search"
                    ? validated.manifest.providers[capability].map((item) => item.id)
                    : undefined;
                checkResult(capability, operation, value, outcome.provider, allowedSearchProviders);
                if (method === "getTvDetail" && tvScope != null) checkTvScope(value, tvScope);
                if (operation === "detail" && value.id !== input) problems.push("detail id " + JSON.stringify(value.id) + " differs from requested " + JSON.stringify(input));
                if (operation === "search" && value.length === 0) err("NOTE: empty result; also run a query that is known to match");
            }
        } catch (error) {
            if (!(error instanceof InvalidResult)) throw error;
            problems.push(error.message);
        }
    }
    if (values.out) fs.writeFileSync(values.out, redact(serialized) + "\n");
    else out(redact(serialized));
    for (const warning of outcome.warnings) err("WARN: " + warning);
    if (problems.length) {
        err("FAIL " + label);
        for (const item of problems) err("  - " + item);
        return 1;
    }
    const count = Array.isArray(value) ? " -> " + value.length + " result(s)" : "";
    err((values.check ? "PASS (checked) " : "OK (not checked; add --check) ") + label + count);
    return 0;
}

function cmdPack(args, values) {
    const [dir, output] = positionals(args, 1, 2, "pack <dir> [out.zip]");
    const result = packPlugin(dir, output, { allowTodo: values["allow-todo"] });
    const plugin = loadPlugin(result.source, result.entry);
    const missing = missingMethods(plugin.exports, result.manifest.capabilities);
    if (missing.length) {
        fs.rmSync(result.output);
        throw new InvalidPlugin("sandbox load did not export callable methods: " + missing.join(", "));
    }
    out("Created " + result.output);
    out("  files: " + [...result.payload.keys()].sort().join(", "));
    out("  size: " + result.size + " bytes");
    out("  sha256: " + result.sha256);
    out("  README config table: " + (result.readmeUpdated ? "refreshed" : "no config markers found; not updated"));
    for (const note of result.notes) if (!/TODO/.test(note)) out("NOTE: " + note);
    return 0;
}

function cmdFields(args) {
    const [only] = positionals(args, 0, 1, "fields [media|actor|tv]");
    if (only && !CAPABILITIES.includes(only)) throw new UsageError("capability must be media, actor or tv");
    for (const capability of only ? [only] : CAPABILITIES) {
        out(capability + "  (methods: " + METHODS[capability].join(", ") + ")");
        for (const [id, meta] of Object.entries(STANDARD_FIELD_META[capability])) {
            out("  " + id.padEnd(16) + meta.fieldType.padEnd(14) + (meta.translatable ? "translatable  " : "              ") +
                "-> " + (meta.result ?? "(no result property; do not declare)"));
        }
    }
    return 0;
}

const COMMANDS = { new: cmdNew, validate: cmdValidate, run: cmdRun, check: cmdCheck, pack: cmdPack, fields: cmdFields };

async function main(argv) {
    const [command, ...rest] = argv;
    if (!command || command === "help" || command === "--help" || command === "-h") {
        out(USAGE);
        return 0;
    }
    if (!COMMANDS[command]) throw new UsageError("unknown command " + command + "; run `node tools/inscura.mjs help`");
    const { values, positionals: args } = parseArgs({ args: rest, options: { ...COMMON, ...OPTIONS[command] }, allowPositionals: true, strict: true });
    if (values.help) {
        out(USAGE);
        return 0;
    }
    return COMMANDS[command](args, values);
}

try {
    process.exitCode = await main(process.argv.slice(2));
} catch (error) {
    const known = [UsageError, InvalidPlugin, InvalidResult, SandboxError, JsonError].some((type) => error instanceof type) ||
        error?.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" || error?.code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" ||
        error?.code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL" || error?.code === "ENOENT";
    err("ERROR: " + (known ? error.message : error?.stack ?? String(error)));
    process.exitCode = 1;
}
