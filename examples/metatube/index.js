// MetaTube Example for Inscura (plugin apiVersion 1).
// Source documentation: https://github.com/metatube-community/metatube-sdk-go
// Runtime: QuickJS. No require, Node built-ins, DOM, timers, URL or URLSearchParams.
"use strict";

var PLUGIN_ID = "metatube-example";
var PLUGIN_VERSION = "1.2.0";
var PLUGIN = "MetaTube Example";
var DEFAULT_BASE_URL = "";
// Where the credential goes: none | header (name = header) | query (name = parameter) | bearer.
var AUTH = {"type":"bearer"};
var PROVIDERS = {"media": ["MetaTube", "FANZA", "10musume", "1Pondo", "AVE", "C0930", "Caribbeancom", "CaribbeancomPR", "DAHLIA", "DUGA", "FALENO", "FC2", "FC2PPVDB", "Gcolle", "Getchu", "H0930", "H4610", "HEYZO", "HeyDouga", "JAV321", "JAVFREE", "JavBus", "KIN8", "MGS", "MURAMURA", "MYWIFE", "PACOPACOMAMA", "Pcolle", "SOD", "TOKYO-HOT", "fc2hub"], "actor": ["MetaTube", "Gfriends"]};
var USER_AGENT = "Inscura-" + PLUGIN_ID + "/" + PLUGIN_VERSION;

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
    var apiKey = AUTH.type === "none" ? undefined : text(config.apiToken);
    var seconds = typeof config.requestTimeout === "number" && isFinite(config.requestTimeout) ? config.requestTimeout : 30;
    return {
        baseUrl: normalizeBaseUrl(config.apiUrl !== undefined ? config.apiUrl : DEFAULT_BASE_URL),
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
    if (AUTH.type === "bearer" && current.apiKey) headers["Authorization"] = "Bearer " + current.apiKey;
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

// Remove omitted and empty optional values before returning plain JSON results.
function compact(value) {
    var result = {};
    Object.keys(value).forEach(function (key) {
        if (value[key] !== undefined && !(Array.isArray(value[key]) && value[key].length === 0)) result[key] = value[key];
    });
    return result;
}
function dataEnvelope(response, label) {
    if (!isObject(response) || response.error || !Object.prototype.hasOwnProperty.call(response, "data")) fail("invalid " + label + " envelope");
    return response.data;
}
function identity(item, capability, provider, id) {
    if (!isObject(item) || !stringId(item.id) || !text(item.provider)) fail("invalid result identity");
    requireProvider(capability, item.provider);
    if ((provider && item.provider !== provider) || (id !== undefined && stringId(item.id) !== id)) fail("upstream identity does not match the requested provider and ID");
}
function knownDate(value, full) {
    var result = date(value);
    return result && Number(result.slice(0, 4)) >= 1900 && (!full || result.length === 10) ? result : undefined;
}
function option(ctx, key, allowed, fallback) {
    var value = ctx.config[key] === undefined ? fallback : ctx.config[key];
    if (allowed.indexOf(value) === -1) fail("invalid setting " + key);
    return value;
}
function enabled(ctx, key, fallback) {
    var value = ctx.config[key];
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") fail("invalid setting " + key);
    return value;
}
function limit(ctx, key, fallback, max) {
    var value = ctx.config[key] === undefined ? fallback : ctx.config[key];
    if (typeof value !== "number" || !isFinite(value)) fail("invalid setting " + key);
    return Math.max(0, Math.min(max, Math.floor(value)));
}
function lazy(ctx) { return option(ctx, "detailMode", ["full", "lazy"], "full") === "lazy"; }
function imageFor(item, kind, direct, ctx) {
    if (!settings(ctx).includeImages || !httpUrl(direct)) return undefined;
    if (option(ctx, "imageMode", ["direct", "proxy"], "proxy") === "direct") return image(direct, ctx);
    return settings(ctx).baseUrl + "/v1/images/" + kind + "/" + encodeURIComponent(item.provider) + "/" + encodeURIComponent(item.id);
}
function previewVideo(item, ctx) {
    var mode = option(ctx, "previewVideoMode", ["auto", "hls", "mp4", "off"], "auto");
    if (mode === "off") return undefined;
    if (mode === "hls") return httpUrl(item.preview_video_hls_url);
    if (mode === "mp4") return httpUrl(item.preview_video_url);
    return httpUrl(item.preview_video_hls_url) || httpUrl(item.preview_video_url);
}
function sourceFields(item, ctx, movie) {
    var fields = [];
    if (!enabled(ctx, "includeCustomFields", true)) return fields;
    fields.push(custom("metatube_provider", "Source provider", item.provider), custom("metatube_id", "Source ID", stringId(item.id)));
    function url(key, name, value) { if (httpUrl(value)) fields.push({ metaKey: key, fieldName: name, fieldType: "url", value: httpUrl(value) }); }
    url("homepage", "Source page", item.homepage);
    if (movie) {
        if (typeof item.runtime === "number" && Number.isInteger(item.runtime) && item.runtime > 0) fields.push(custom("duration_minutes", "Source runtime (minutes)", String(item.runtime)));
        if (settings(ctx).includeImages) { url("thumb_url", "Source poster URL", item.thumb_url); url("cover_url", "Source cover URL", item.cover_url); }
        if (option(ctx, "previewVideoMode", ["auto", "hls", "mp4", "off"], "auto") !== "off") url("preview_video_hls_url", "HLS preview URL", item.preview_video_hls_url);
    }
    return fields;
}
function rating(item) {
    // FANZA's official adapter exposes a 0..5 review score. Other providers are not assumed to share its scale.
    return item.provider === "FANZA" ? score10(item.score, 5) : undefined;
}
function photoUrls(values, ctx) {
    return names(values).map(function (url) { return image(url, ctx); }).filter(Boolean);
}
function custom(key, label, value) {
    return { metaKey: key, fieldName: label, fieldType: "text", value: value };
}
async function search(kind, query, ctx) {
    var capability = kind === "movies" ? "media" : "actor";
    var selected = requireProvider(capability, ctx.request && ctx.request.provider);
    if (!text(query)) return [];
    var sources = [selected];
    if (selected === "MetaTube") {
        var configured = ctx.config[kind === "movies" ? "movieProviders" : "actorProviders"];
        if (configured === undefined) configured = ["default"];
        if (!Array.isArray(configured)) fail("source selection must be an array");
        if (configured.length === 0 || configured.indexOf("default") !== -1) sources = [undefined];
        else sources = configured.map(function (provider) { if (provider === "MetaTube") fail("invalid source selection"); return requireProvider(capability, provider); });
        sources = sources.filter(function (provider, index) { return sources.indexOf(provider) === index; });
    }
    var results = [], seen = {};
    for (var index = 0; index < sources.length; index++) {
        var provider = sources[index];
        var response = await request(ctx, "/v1/" + kind + "/search", { q: text(query), provider: provider, fallback: enabled(ctx, "fallback", true) }, { notFound: { data: [] } });
        requireArray(dataEnvelope(response, "search"), "search").forEach(function (item) {
            identity(item, capability);
            if (item.provider === "MetaTube") fail("upstream must return a real source provider");
            var key = item.provider + "::" + stringId(item.id);
            if (seen[key]) return;
            seen[key] = true;
            if (capability === "media") {
                if (!text(item.title)) fail("invalid movie title");
                results.push(compact({ id: stringId(item.id), provider: item.provider, title: text(item.title), number: text(item.number), releaseDate: knownDate(item.release_date), score: rating(item), thumbUrl: imageFor(item, "primary", item.thumb_url || item.cover_url, ctx), coverUrl: imageFor(item, "backdrop", item.cover_url, ctx) }));
            } else {
                if (!text(item.name)) fail("invalid actor name");
                results.push(compact({ id: stringId(item.id), provider: item.provider, name: text(item.name), avatar: imageFor(item, "primary", names(item.images)[0], ctx) }));
            }
        });
    }
    return results;
}
async function detail(kind, provider, id, ctx) {
    requireProvider(kind === "movies" ? "media" : "actor", provider);
    if (provider === "MetaTube") fail("detail requires the real source provider from a search result");
    id = stringId(id) || fail("invalid ID");
    var response = await request(ctx, "/v1/" + kind + "/" + encodeURIComponent(provider) + "/" + encodeURIComponent(id), { lazy: lazy(ctx) });
    var item = dataEnvelope(response, "detail");
    identity(item, kind === "movies" ? "media" : "actor", provider, id);
    return item;
}
module.exports = {
    test: async function (ctx) {
        // Unlike /v1/providers, this route is behind MetaTube's authentication middleware.
        var data = dataEnvelope(await request(ctx, "/v1/db/version"), "connection test");
        if (!isObject(data) || !(text(data.version) || (typeof data.version === "number" && isFinite(data.version)))) fail("invalid database version response");
        return { ok: true };
    },
    searchMedia: async function (keyword, ctx) { return search("movies", keyword, ctx); },
    getMediaDetail: async function (provider, id, ctx) {
        var item = await detail("movies", provider, id, ctx);
        if (!text(item.title)) fail("invalid movie title");
        var cast = names(item.actors).map(function (name, index) { return { name: name, roles: [{ slug: "actor", name: "Actor" }], sortOrder: index }; });
        var director = text(item.director);
        var fields = sourceFields(item, ctx, true);
        var reviewLimit = limit(ctx, "maxReviews", 5, 50);
        if (enabled(ctx, "includeReviews", false) && reviewLimit > 0) {
            var reviews = requireArray(dataEnvelope(await request(ctx, "/v1/reviews/" + encodeURIComponent(item.provider) + "/" + encodeURIComponent(item.id), { lazy: lazy(ctx) }), "reviews"), "reviews").slice(0, reviewLimit);
            var lines = reviews.map(function (review) {
                if (!isObject(review) || !text(review.comment)) fail("invalid review entry");
                return [text(review.title), text(review.author), knownDate(review.date), text(review.comment)].filter(Boolean).join("\n");
            });
            fields.push(custom("review_count", "Imported review count", String(lines.length)));
            if (lines.length) fields.push({ metaKey: "reviews", fieldName: "Reviews", fieldType: "long_text", value: lines.join("\n\n") });
        }
        return compact({
            id: stringId(item.id), provider: item.provider, title: text(item.title), number: text(item.number), summary: text(item.summary),
            thumbUrl: imageFor(item, "primary", item.thumb_url || item.cover_url, ctx), bigThumbUrl: imageFor(item, "primary", item.big_thumb_url || item.thumb_url || item.cover_url, ctx), coverUrl: imageFor(item, "backdrop", item.cover_url, ctx), bigCoverUrl: imageFor(item, "backdrop", item.big_cover_url || item.cover_url, ctx),
            previewVideoUrl: previewVideo(item, ctx), photos: enabled(ctx, "includePreviewImages", true) ? photoUrls(item.preview_images, ctx).slice(0, limit(ctx, "maxPreviewImages", 20, 100)) : undefined,
            cast: cast, crew: director ? [{ name: director, roles: [{ slug: "director", name: "Director", job: "Director" }] }] : undefined,
            maker: text(item.maker), label: text(item.label), series: text(item.series), genres: names(item.genres), score: rating(item),
            releaseDate: knownDate(item.release_date), sourceUrl: httpUrl(item.homepage),
            customFields: fields
        });
    },
    searchActors: async function (name, ctx) { return search("actors", name, ctx); },
    getActorDetail: async function (provider, id, ctx) {
        var person = await detail("actors", provider, id, ctx);
        if (!text(person.name)) fail("invalid actor name");
        var photos = photoUrls(person.images, ctx);
        var fields = sourceFields(person, ctx, false);
        var extended = enabled(ctx, "includeActorExtendedFields", true);
        if (extended && names(person.aliases).length) fields.push({ metaKey: "actor_aliases", fieldName: "Actor aliases", fieldType: "multi_select", value: names(person.aliases) });
        if (extended) [["blood_type", "Blood type"], ["cup_size", "Cup size"], ["hobby", "Hobby"]].forEach(function (definition) { var value = text(person[definition[0]]); if (value) fields.push(custom(definition[0], definition[1], value)); });
        return compact({ id: stringId(person.id), provider: person.provider, name: text(person.name), description: text(person.summary), aliases: extended ? names(person.aliases) : undefined,
            birthday: extended ? knownDate(person.birthday, true) : undefined, debutDate: extended ? knownDate(person.debut_date, true) : undefined,
            height: extended && typeof person.height === "number" && isFinite(person.height) && person.height > 0 ? String(person.height) : undefined,
            measurements: extended ? text(person.measurements) : undefined, nationality: extended ? text(person.nationality) : undefined, skills: extended && text(person.skill) ? [text(person.skill)] : undefined,
            avatar: imageFor(person, "primary", photos[0], ctx), photos: photos, sourceUrl: httpUrl(person.homepage), customFields: fields });
    }
};
