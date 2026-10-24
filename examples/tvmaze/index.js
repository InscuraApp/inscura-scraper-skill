// TVmaze public API example for Inscura API v1. No API key is required.
// Data attribution and image conditions: see ATTRIBUTION.md.
"use strict";

var API = "https://api.tvmaze.com";
var PROVIDER = "tvmaze";
var PLUGIN_ID = "tvmaze-example";

function fail(message) {
    throw new Error("TVmaze: " + message);
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value, minimum) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function remoteId(value) {
    if (integer(value, 1)) return String(value);
    if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) return value;
    fail("invalid resource ID");
}

function requireProvider(provider) {
    if (provider !== PROVIDER) fail("unsupported provider");
}

function requireArray(value, label) {
    if (!Array.isArray(value)) fail("invalid " + label + " response (expected an array)");
    return value;
}

function resource(value, label) {
    if (!isObject(value) || !text(value.name)) fail("invalid " + label + " response");
    remoteId(value.id);
    return value;
}

function sameResource(value, id, label) {
    resource(value, label);
    if (remoteId(value.id) !== id) fail(label + " response has a different resource ID");
    return value;
}

async function getJson(ctx, path) {
    var response;
    try {
        response = await ctx.fetch(API + path, {
            headers: {
                "Accept": "application/json",
                "User-Agent": "Inscura-TVmaze-Example/1.3.0"
            }
        });
    } catch (error) {
        // Do not forward raw network errors, response bodies, or credentials.
        fail("network request failed; check your connection and retry");
    }
    if (!response || typeof response.status !== "number") fail("invalid HTTP response");
    if (!response.ok) {
        // QuickJS exposes no timer; immediate retries would worsen rate limiting.
        if (response.status === 429) fail("rate limit reached (HTTP 429); wait a few seconds and retry");
        if (response.status === 404) fail("resource or endpoint not found (HTTP 404)");
        fail("request failed (HTTP " + response.status + ")");
    }
    try {
        return await response.json();
    } catch (error) {
        fail("invalid JSON response");
    }
}

function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    var parsed = new Date(value + "T00:00:00Z");
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
        ? value : undefined;
}

function year(value) {
    var normalized = date(value);
    return normalized ? Number(normalized.slice(0, 4)) : undefined;
}

function rating(value) {
    var average = isObject(value) ? value.average : undefined;
    return typeof average === "number" && Number.isFinite(average) && average > 0 && average <= 10
        ? average : undefined;
}

// TVmaze search weights are relative relevance, not calibrated probabilities.
// Positive scores can exceed 1. This strictly increasing transform preserves
// source score ordering in Inscura's 0..1 matchScore range without clamping.
function relevanceScore(value) {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value / (1 + value) : undefined;
}

function duration(value) {
    return integer(value, 1) ? value : undefined;
}

function plainText(value) {
    if (!text(value)) return undefined;
    // The API's summaries contain simple HTML. Produce plain text without DOM APIs.
    var entities = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return text(value
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<\/?(?:p|br|div|li)\b[^>]*>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, function (entity, key) {
            key = key.toLowerCase();
            if (key.charAt(0) !== "#") return entities[key];
            var code = key.charAt(1) === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
            return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
                ? String.fromCodePoint(code) : entity;
        })
        .replace(/[\t ]+/g, " ")
        .replace(/\n\s*\n/g, "\n\n"));
}

function setting(ctx, key, fallback) {
    var value = ctx.config && ctx.config[key];
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") fail("invalid " + key + " setting (expected boolean)");
    return value;
}

function validateSettings(ctx) {
    setting(ctx, "includeImages", true);
    setting(ctx, "includeCast", true);
    setting(ctx, "includeCrew", false);
    setting(ctx, "includeAliases", false);
}

function imageUrl(value, ctx) {
    if (!setting(ctx, "includeImages", true) || !isObject(value)) return undefined;
    var url = text(value.original) || text(value.medium);
    return url && /^https:\/\/[^\s]+$/i.test(url) ? url : undefined;
}

function sourceUrl(kind, id) {
    return "https://www.tvmaze.com/" + kind + "/" + id;
}

function externalIds(show) {
    var result = [];
    if (!isObject(show.externals)) return result;
    if (typeof show.externals.imdb === "string" && /^tt[0-9]+$/.test(show.externals.imdb)) {
        result.push({ provider: "imdb", id: show.externals.imdb });
    }
    if (integer(show.externals.thetvdb, 1)) {
        result.push({ provider: "tvdb", id: String(show.externals.thetvdb) });
    }
    // TVmaze's own ID remains in id/provider, not the host's externalIds whitelist.
    return result;
}

function networks(show) {
    var result = [];
    [show.network, show.webChannel].forEach(function (item) {
        var name = isObject(item) ? text(item.name) : undefined;
        if (name && result.indexOf(name) === -1) result.push(name);
    });
    return result;
}

function castCredits(value) {
    return requireArray(value, "cast").map(function (item, index) {
        if (!isObject(item)) fail("invalid cast entry");
        var person = resource(item.person, "cast person");
        var role = isObject(item.character) ? text(item.character.name) : undefined;
        return {
            name: person.name.trim(),
            scraperPluginId: PLUGIN_ID,
            providerId: PROVIDER,
            providerActorId: remoteId(person.id),
            roles: [{ slug: "actor", name: "Actor", character: role || "" }],
            sortOrder: index
        };
    });
}

function crewCredits(value) {
    return requireArray(value, "crew").map(function (item, index) {
        if (!isObject(item) || !text(item.type)) fail("invalid crew entry");
        var person = resource(item.person, "crew person");
        var job = item.type.trim();
        var slug = job.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        if (!slug) fail("invalid crew type");
        return {
            name: person.name.trim(),
            scraperPluginId: PLUGIN_ID,
            providerId: PROVIDER,
            providerActorId: remoteId(person.id),
            roles: [{ slug: slug, name: job, job: job }],
            sortOrder: index
        };
    });
}

function aliases(value) {
    var result = [];
    requireArray(value, "aliases").forEach(function (item) {
        if (!isObject(item) || !text(item.name)) fail("invalid alias entry");
        var name = item.name.trim();
        if (result.indexOf(name) === -1) result.push(name);
    });
    return result;
}

function scopeFrom(ctx) {
    var scope = ctx.request && ctx.request.tvScope;
    if (scope === undefined || scope === null) return null;
    if (!isObject(scope)) fail("invalid TV scope");
    var seen = {};
    return requireArray(scope.seasons, "TV scope").map(function (season) {
        if (!isObject(season) || !integer(season.seasonNumber, 0) || seen[season.seasonNumber]) {
            fail("invalid or duplicate season in TV scope");
        }
        seen[season.seasonNumber] = true;
        var numbers = requireArray(season.episodeNumbers, "TV scope episodes");
        if (numbers.some(function (number) { return !integer(number, 0); })) fail("invalid episode in TV scope");
        return { seasonNumber: season.seasonNumber, episodeNumbers: numbers };
    });
}

function seasonScope(scope, number) {
    return scope === null ? null : scope.find(function (entry) { return entry.seasonNumber === number; });
}

function mapSeason(season, ctx) {
    return {
        seasonNumber: season.number,
        title: text(season.name),
        description: plainText(season.summary),
        year: year(season.premiereDate),
        firstAired: date(season.premiereDate),
        poster: imageUrl(season.image, ctx)
    };
}

function mapEpisode(episode, ctx) {
    return {
        seasonNumber: episode.season,
        episodeNumber: episode.number,
        title: text(episode.name),
        description: plainText(episode.summary),
        releaseDate: date(episode.airdate),
        rating: rating(episode.rating),
        runtime: duration(episode.runtime),
        stillUrl: imageUrl(episode.image, ctx)
    };
}

module.exports = {
    test: async function (ctx) {
        validateSettings(ctx);
        // A documented public resource verifies both reachability and response shape.
        sameResource(await getJson(ctx, "/shows/1"), "1", "show");
        return { ok: true };
    },

    searchTv: async function (keyword, ctx) {
        validateSettings(ctx);
        requireProvider(ctx.request && ctx.request.provider);
        var query = text(keyword);
        if (!query) return [];
        var data = requireArray(await getJson(ctx, "/search/shows?q=" + encodeURIComponent(query)), "show search");
        // TVmaze has no search year/language parameter. Preserve all same-name candidates.
        // Preserve its relative relevance ordering; matchScore is not a probability.
        return data.map(function (entry) {
            if (!isObject(entry)) fail("invalid show search entry");
            var show = resource(entry.show, "show search entry");
            return {
                id: remoteId(show.id),
                provider: PROVIDER,
                title: show.name.trim(),
                matchScore: relevanceScore(entry.score),
                year: year(show.premiered),
                firstAired: date(show.premiered),
                status: text(show.status),
                network: networks(show).join(", ") || undefined,
                overview: plainText(show.summary),
                posterUrl: imageUrl(show.image, ctx),
                externalIds: externalIds(show)
            };
        });
    },

    getTvDetail: async function (provider, id, ctx) {
        validateSettings(ctx);
        requireProvider(provider);
        id = remoteId(id);
        var scope = scopeFrom(ctx);
        var includeCast = setting(ctx, "includeCast", true);
        var show = sameResource(await getJson(ctx, "/shows/" + id + (includeCast ? "?embed=cast" : "")), id, "show");
        if (includeCast && !isObject(show._embedded)) fail("missing embedded cast");
        var result = {
            id: id,
            provider: PROVIDER,
            title: show.name.trim(),
            description: plainText(show.summary),
            year: year(show.premiered),
            firstAired: date(show.premiered),
            lastAired: date(show.ended),
            averageRuntime: duration(show.averageRuntime) || duration(show.runtime),
            rating: rating(show.rating),
            externalIds: externalIds(show),
            tvGenre: requireArray(show.genres, "genres").map(function (genre) {
                if (!text(genre)) fail("invalid genre");
                return genre.trim();
            }),
            network: networks(show),
            tvStatus: text(show.status),
            cast: includeCast ? castCredits(show._embedded.cast) : undefined,
            poster: imageUrl(show.image, ctx),
            sourceUrl: sourceUrl("shows", id),
            seasons: [],
            episodes: [],
            episodeCatalogs: []
        };
        if (setting(ctx, "includeCrew", false)) result.crew = crewCredits(await getJson(ctx, "/shows/" + id + "/crew"));
        if (setting(ctx, "includeAliases", false)) result.aliases = aliases(await getJson(ctx, "/shows/" + id + "/akas"));
        if (scope !== null && scope.length === 0) return result;

        // At most five sequential requests total; never fan out one request per episode.
        var seasons = requireArray(await getJson(ctx, "/shows/" + id + "/seasons"), "seasons");
        var episodes = requireArray(await getJson(ctx, "/shows/" + id + "/episodes?specials=1"), "episodes");
        var knownSeasons = {};
        seasons.forEach(function (season) {
            if (!isObject(season) || !integer(season.number, 0) || knownSeasons[season.number]) {
                fail("invalid or duplicate season");
            }
            remoteId(season.id);
            knownSeasons[season.number] = true;
        });
        var knownEpisodes = {};
        episodes = episodes.filter(function (episode) {
            if (!isObject(episode) || !integer(episode.season, 0)) fail("invalid episode");
            remoteId(episode.id);
            // Specials/unassigned episodes have no stable official episode number.
            // Do not invent season zero, sequential IDs, DVD or absolute numbering.
            if (episode.number === null) return false;
            if (!integer(episode.number, 0)) fail("invalid official episode number");
            var key = episode.season + ":" + episode.number;
            if (knownEpisodes[key]) fail("duplicate official episode number");
            knownEpisodes[key] = true;
            return true;
        });
        seasons.forEach(function (season) {
            var requested = seasonScope(scope, season.number);
            if (scope !== null && !requested) return;
            var entries = episodes.filter(function (episode) { return episode.season === season.number; });
            // A scoped empty local season still receives its full official directory.
            result.episodeCatalogs.push({
                seasonNumber: season.number,
                episodes: entries.map(function (episode) {
                    return { episodeNumber: episode.number, title: text(episode.name) };
                })
            });
            if (scope === null || requested.episodeNumbers.length > 0) {
                result.seasons.push(mapSeason(season, ctx));
            }
            entries.forEach(function (episode) {
                if (scope === null || requested.episodeNumbers.indexOf(episode.number) !== -1) {
                    result.episodes.push(mapEpisode(episode, ctx));
                }
            });
        });
        return result;
    },

    searchActors: async function (name, ctx) {
        validateSettings(ctx);
        requireProvider(ctx.request && ctx.request.provider);
        var query = text(name);
        if (!query) return [];
        var data = requireArray(await getJson(ctx, "/search/people?q=" + encodeURIComponent(query)), "people search");
        return data.map(function (entry) {
            if (!isObject(entry)) fail("invalid people search entry");
            var person = resource(entry.person, "people search entry");
            return {
                id: remoteId(person.id),
                provider: PROVIDER,
                name: person.name.trim(),
                matchScore: relevanceScore(entry.score),
                avatar: imageUrl(person.image, ctx)
            };
        });
    },

    getActorDetail: async function (provider, id, ctx) {
        validateSettings(ctx);
        requireProvider(provider);
        id = remoteId(id);
        var person = sameResource(await getJson(ctx, "/people/" + id), id, "person");
        return {
            id: id,
            provider: PROVIDER,
            name: person.name.trim(),
            birthday: year(person.birthday) >= 1900 ? date(person.birthday) : undefined,
            gender: text(person.gender),
            avatar: imageUrl(person.image, ctx),
            sourceUrl: sourceUrl("people", id)
            // No invented biography, nationality, aliases, or social accounts.
        };
    }
};
