// {{NAME}} for Inscura (plugin apiVersion 1).
// Source documentation: {{HOMEPAGE}}
// Runtime: QuickJS. No require, Node built-ins, DOM, timers, URL or URLSearchParams.
"use strict";

var PLUGIN = {{NAME_JSON}};
var DEFAULT_BASE_URL = {{BASE_URL_JSON}};
// Where the credential goes: none | header (name = header) | query (name = parameter) | bearer.
var AUTH = {{AUTH_JSON}};
var PROVIDERS = {{PROVIDERS_JSON}};
var USER_AGENT = {{USER_AGENT_JSON}};

function fail(message) {
    throw new Error(PLUGIN + ": " + message);
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringId(value) {
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
    return text(value);
}

function requireArray(value, label) {
    if (!Array.isArray(value)) fail("invalid " + label + " response (expected an array)");
    return value;
}

function requireProvider(capability, provider) {
    if ((PROVIDERS[capability] || []).indexOf(provider) === -1) fail("unsupported provider " + String(provider));
    return provider;
}

function normalizeBaseUrl(value) {
    var url = text(value);
    if (!url) fail("server URL is not configured; set it in the plugin settings");
    // Only scheme, host and optional path: credentials, queries and fragments are rejected.
    if (!/^https?:\/\/[^\s\/?#@]+(\/[^\s?#]*)?$/i.test(url)) fail("server URL must look like https://host[/path]");
    return url.replace(/\/+$/, "");
}

function settings(ctx) {
    var config = (ctx && ctx.config) || {};
    var apiKey = AUTH.type === "none" ? undefined : text(config.apiKey);
    if (AUTH.type !== "none" && !apiKey) fail("API key is not configured; enter it in the plugin settings");
    var seconds = typeof config.requestTimeout === "number" && isFinite(config.requestTimeout) ? config.requestTimeout : 30;
    return {
        baseUrl: normalizeBaseUrl(config.baseUrl !== undefined ? config.baseUrl : DEFAULT_BASE_URL),
        apiKey: apiKey,
        timeoutMs: Math.min(180, Math.max(5, seconds)) * 1000,
        includeImages: config.includeImages !== false,
        // Global scraping language chosen in Inscura (for example "zh-CN"); not a plugin setting.
        language: text(config.language) || "en"
    };
}

function queryString(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
        var value = params[key];
        if (value === undefined || value === null || value === "") return;
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
    });
    return parts.length ? "?" + parts.join("&") : "";
}

// GET a JSON resource. options.notFound: value to return on HTTP 404 (only where
// the API documents 404 as "no results"); otherwise 404 is an error.
async function request(ctx, path, params, options) {
    var current = settings(ctx);
    var query = {};
    Object.keys(params || {}).forEach(function (key) { query[key] = params[key]; });
    var headers = { "Accept": "application/json", "User-Agent": USER_AGENT };
    if (AUTH.type === "header") headers[AUTH.name] = current.apiKey;
    if (AUTH.type === "bearer") headers["Authorization"] = "Bearer " + current.apiKey;
    if (AUTH.type === "query") query[AUTH.name] = current.apiKey;
    var response;
    try {
        response = await ctx.fetch(current.baseUrl + path + queryString(query), {
            headers: headers,
            timeoutMs: current.timeoutMs
        });
    } catch (error) {
        // Never forward raw network errors: they can contain the authenticated URL.
        fail("network request failed; check the connection and server URL");
    }
    if (!response || typeof response.status !== "number") fail("invalid HTTP response");
    if (response.status === 404 && options && options.notFound !== undefined) return options.notFound;
    if (!response.ok) {
        if (response.status === 401 || response.status === 403) fail("authentication failed (HTTP " + response.status + "); check the API key");
        if (response.status === 404) fail("resource not found (HTTP 404)");
        // No timers in the host: report rate limits instead of retrying in a loop.
        if (response.status === 429) fail("rate limit reached (HTTP 429); wait a moment and retry");
        fail("request failed (HTTP " + response.status + ")");
    }
    try {
        return await response.json();
    } catch (error) {
        fail("invalid JSON response");
    }
}

// Returns YYYY, YYYY-MM or YYYY-MM-DD for valid calendar values, otherwise undefined.
function date(value) {
    var match = typeof value === "string" ? /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:$|T)/.exec(value.trim()) : null;
    if (!match) return undefined;
    var y = Number(match[1]);
    var m = match[2] ? Number(match[2]) : 1;
    var d = match[3] ? Number(match[3]) : 1;
    var parsed = new Date(Date.UTC(y, m - 1, d));
    if (y < 1000 || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) return undefined;
    return match[1] + (match[2] ? "-" + match[2] + (match[3] ? "-" + match[3] : "") : "");
}

function year(value) {
    var normalized = date(value);
    return normalized ? Number(normalized.slice(0, 4)) : undefined;
}

// Converts a rating on a documented 0..scale range to 0..10; unknown or zero ratings are omitted.
function score10(value, scale) {
    if (typeof value !== "number" || !isFinite(value) || value <= 0 || value > scale) return undefined;
    return Math.round((value / scale) * 100) / 10;
}

function httpUrl(value) {
    var url = text(value);
    return url && /^https?:\/\/[^\s]+$/i.test(url) ? url : undefined;
}

function image(value, ctx) {
    return settings(ctx).includeImages ? httpUrl(value) : undefined;
}

function names(values) {
    var result = [];
    (Array.isArray(values) ? values : []).forEach(function (value) {
        var name = text(isObject(value) ? value.name : value);
        if (name && result.indexOf(name) === -1) result.push(name);
    });
    return result;
}

function hasIdentity(item) {
    return Boolean(item.id && (item.title || item.name));
}
{{CAPABILITY_HELPERS}}
module.exports = {
    test: async function (ctx) {
        // TODO(inscura): call a lightweight, documented, read-only endpoint that also proves the credential works.
        await request(ctx, "/");
        return { ok: true };
    },
{{METHODS}}
};
