// Runs plugin code in a fresh realm that approximates the host's QuickJS
// runtime: ECMAScript built-ins only, CommonJS exports, and a mock `ctx`.
// This is a development harness, not a security boundary.

import fs from "node:fs";
import vm from "node:vm";
import { METHODS } from "./fields.mjs";
import { parseStrictJson } from "./json.mjs";

// Present in Node's vm realm but absent from (or unreliable in) the host runtime.
const REMOVED_GLOBALS = ["console", "Intl", "WebAssembly", "SharedArrayBuffer", "Atomics", "Temporal",
    "Iterator", "DisposableStack", "AsyncDisposableStack", "SuppressedError", "Float16Array"];
const FETCH_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);
const FETCH_OPTIONS = new Set(["method", "headers", "body", "timeoutMs"]);

export class SandboxError extends Error {}

export function methodInfo(method) {
    if (method === "test") return { capability: null, operation: "test" };
    for (const [capability, [search, detail]] of Object.entries(METHODS)) {
        if (method === search) return { capability, operation: "search" };
        if (method === detail) return { capability, operation: "detail" };
    }
    throw new SandboxError("unknown plugin method " + method + "; expected test or one of " + Object.values(METHODS).flat().join(", "));
}

export function loadPlugin(source, filename = "index.js") {
    const context = vm.createContext({});
    vm.runInContext(REMOVED_GLOBALS.map((name) => "delete globalThis." + name + ";").join(""), context);
    const sandboxJson = vm.runInContext("JSON", context);
    const module = vm.runInContext("({ exports: {} })", context);
    let factory;
    try {
        factory = vm.compileFunction(source, ["module", "exports"], { filename, parsingContext: context });
    } catch (error) {
        throw new SandboxError("syntax error in " + filename + ": " + error.message);
    }
    try {
        factory.call(undefined, module, module.exports);
    } catch (error) {
        throw new SandboxError("top-level code failed in the sandbox: " + describeError(error));
    }
    let exported = module.exports;
    const isCallableSet = (value) => value !== null && typeof value === "object" &&
        Object.values(METHODS).flat().concat("test").some((name) => typeof value[name] === "function");
    if (exported && !isCallableSet(exported) && isCallableSet(exported.default)) exported = exported.default;
    return { exports: exported, sandboxJson };
}

export function missingMethods(exported, capabilities) {
    return capabilities.flatMap((capability) => METHODS[capability]).filter((name) => typeof exported?.[name] !== "function");
}

function describeError(error) {
    if (error && typeof error === "object" && typeof error.message === "string") return (error.name ? error.name + ": " : "") + error.message;
    return String(error);
}

export function configDefaults(manifest) {
    const defaults = {};
    for (const field of manifest.config ?? []) if (field.default !== undefined) defaults[field.key] = field.default;
    return defaults;
}

export function secretValues(manifest, config) {
    return (manifest.config ?? [])
        .filter((field) => field.type === "password")
        .map((field) => config[field.key])
        .filter((value) => typeof value === "string" && value.length >= 4);
}

export function redactor(secrets) {
    return (text) => secrets.reduce((result, secret) => result.split(secret).join("***")
        .split(encodeURIComponent(secret)).join("***"), String(text));
}

function readFixtures(file) {
    const data = parseStrictJson(fs.readFileSync(file, "utf8"), file);
    const list = Array.isArray(data) ? data : data?.requests;
    if (!Array.isArray(list)) throw new SandboxError(file + ": expected an array or { \"requests\": [...] }");
    list.forEach((entry, index) => {
        const where = file + " requests[" + index + "]";
        if (entry === null || typeof entry !== "object" || typeof entry.url !== "string") throw new SandboxError(where + ": url is required");
        if (entry.match !== undefined && entry.match !== "exact" && entry.match !== "prefix") throw new SandboxError(where + ": match must be exact or prefix");
        if (!entry.networkError && !Number.isInteger(entry.status ?? 200)) throw new SandboxError(where + ": status must be an integer");
    });
    return list;
}

function clampTimeout(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 30000;
    return Math.min(180000, Math.max(1, Math.floor(value)));
}

function makeResponse(status, body, sandboxJson) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => body,
        json: async () => sandboxJson.parse(body),
    };
}

// Returns { fetch, requests, unmatched, recorded }. Request URLs are stored redacted.
export function createFetch({ mode, fixtures, redact, warn, sandboxJson }) {
    const requests = [];
    const unmatched = [];
    const recorded = [];
    const fixtureList = mode === "fixtures" ? readFixtures(fixtures) : [];
    const fetch = async (url, options) => {
        if (typeof url !== "string") throw new Error("ctx.fetch expects a string URL");
        options = options ?? {};
        for (const key of Object.keys(options)) {
            if (!FETCH_OPTIONS.has(key)) warn("ctx.fetch ignores option " + JSON.stringify(key) + "; supported: method, headers, body, timeoutMs");
        }
        let method = typeof options.method === "string" ? options.method.toUpperCase() : "GET";
        if (!FETCH_METHODS.has(method)) {
            warn("ctx.fetch method " + method + " is not supported by the host and falls back to GET");
            method = "GET";
        }
        if (options.body !== undefined && typeof options.body !== "string") warn("ctx.fetch body must be a string; use JSON.stringify");
        const safeUrl = redact(url);
        requests.push(method + " " + safeUrl);
        if (mode === "fixtures") {
            const entry = fixtureList.find((item) => (item.method ?? "GET").toUpperCase() === method &&
                (item.match === "prefix" ? safeUrl.startsWith(item.url) : item.url === safeUrl));
            if (!entry) {
                unmatched.push(method + " " + safeUrl);
                throw new Error("network error (no fixture for " + method + " " + safeUrl + ")");
            }
            if (entry.networkError) throw new Error("network error (fixture)");
            const body = entry.text !== undefined ? String(entry.text) : entry.json !== undefined ? JSON.stringify(entry.json) : "";
            return makeResponse(entry.status ?? 200, body, sandboxJson);
        }
        let response;
        try {
            response = await globalThis.fetch(url, {
                method,
                headers: options.headers,
                body: options.body,
                signal: AbortSignal.timeout(clampTimeout(options.timeoutMs)),
            });
        } catch {
            throw new Error("network error");
        }
        const body = await response.text();
        if (mode === "record") {
            let json;
            try {
                json = JSON.parse(body);
            } catch {
                json = undefined;
            }
            recorded.push({ method, url: safeUrl, status: response.status, ...(json !== undefined ? { json } : { text: body }) });
        }
        return makeResponse(response.status, body, sandboxJson);
    };
    return { fetch, requests, unmatched, recorded };
}

// Flags values that do not survive the host's JSON transport.
export function findUnserializable(value, path = "$", seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return null;
    if (typeof value === "number") return Number.isFinite(value) ? null : path + ": non-finite number " + value;
    if (typeof value === "undefined") return path + ": undefined inside an array (omit the element instead)";
    if (typeof value !== "object") return path + ": " + typeof value + " values are not JSON";
    if (seen.has(value)) return path + ": circular reference";
    seen.add(value);
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            const problem = findUnserializable(value[index], path + "[" + index + "]", seen);
            if (problem) return problem;
        }
    } else {
        const proto = Object.getPrototypeOf(value);
        if (proto !== null && Object.getPrototypeOf(proto) !== null) {
            return path + ": " + (proto.constructor?.name ?? "non-plain") + " object; return plain objects, arrays and strings";
        }
        for (const [key, item] of Object.entries(value)) {
            if (item === undefined) continue;
            const problem = findUnserializable(item, path + "." + key, seen);
            if (problem) return problem;
        }
    }
    seen.delete(value);
    return null;
}

export async function invoke({ plugin, manifest, method, input, provider, config, language, locale, year, tvScope, fetchMode, fixtures, log }) {
    const { capability, operation } = methodInfo(method);
    const fn = plugin.exports?.[method];
    if (typeof fn !== "function") throw new SandboxError("plugin does not export " + method);
    if (capability && !manifest.capabilities.includes(capability)) throw new SandboxError(method + " belongs to undeclared capability " + capability);
    if (capability) {
        const known = (manifest.providers[capability] ?? []).map((item) => item.id);
        provider = provider ?? known[0];
        if (!known.includes(provider)) throw new SandboxError("provider " + provider + " is not declared for " + capability + " (" + known.join(", ") + ")");
    }
    const mergedConfig = { ...configDefaults(manifest), ...config, language: language ?? config.language ?? "en" };
    const redact = redactor(secretValues(manifest, mergedConfig));
    const warnings = [];
    const warn = (message) => {
        warnings.push(message);
        log("warn", message);
    };
    const http = createFetch({ mode: fetchMode, fixtures, redact, warn, sandboxJson: plugin.sandboxJson });
    let request = {};
    if (operation === "search") request = capability === "actor" ? { provider } : { provider, year: year ?? null };
    if (operation === "detail") request = capability === "tv" && tvScope !== undefined ? { provider, tvScope } : { provider };
    const ctx = plugin.sandboxJson.parse(JSON.stringify({ config: mergedConfig, request, app: { version: "inscura-tools", locale: locale ?? "en" } }));
    const logger = (level) => (message) => {
        if (typeof message !== "string") warn("ctx.log." + level + " expects one string; format objects before logging");
        log(level, redact(message));
    };
    ctx.fetch = http.fetch;
    ctx.log = { info: logger("info"), warn: logger("warn"), error: logger("error") };
    const args = operation === "test" ? [ctx] : operation === "search" ? [input ?? "", ctx] : [provider, input, ctx];
    const outcome = { capability, operation, provider, warnings, http, redact, secrets: secretValues(manifest, mergedConfig) };
    try {
        outcome.value = await fn.apply(plugin.exports, args);
        outcome.ok = true;
    } catch (error) {
        outcome.ok = false;
        outcome.error = error;
        outcome.errorMessage = redact(describeError(error));
        outcome.errorIsError = error !== null && typeof error === "object" && typeof error.message === "string";
    }
    return outcome;
}
