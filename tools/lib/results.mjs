// Raw plugin result checks against docs/result-types.md. Input must be the
// plugin's own return value, not upstream envelopes or host-defaulted objects.

export class InvalidResult extends Error {}

function require(ok, path, message) {
    if (!ok) throw new InvalidResult(path + ": " + message);
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function string(value, path) {
    require(typeof value === "string", path, "expected string, not null or another type");
}

function nonempty(value, path) {
    string(value, path);
    require(value.trim() !== "", path, "must not be empty");
}

function number(value, path) {
    require(typeof value === "number" && Number.isFinite(value), path, "expected finite number");
}

function integer(value, path) {
    require(Number.isInteger(value), path, "expected integer");
    require(Math.abs(value) < 2 ** 63, path, "integer outside signed 64-bit range");
}

function nonnegative(value, path) {
    integer(value, path);
    require(value >= 0, path, "must be a nonnegative integer");
}

function positive(value, path) {
    integer(value, path);
    require(value > 0, path, "must be a positive integer (runtime uses minutes)");
}

function boolean(value, path) {
    require(typeof value === "boolean", path, "expected boolean");
}

const nullable = (check) => (value, path) => (value === null ? undefined : check(value, path));

const array = (check) => (value, path) => {
    require(Array.isArray(value), path, "expected array, not null");
    value.forEach((item, index) => check(item, path + "[" + index + "]"));
};

const choice = (...allowed) => (value, path) => {
    string(value, path);
    require(allowed.includes(value), path, "expected one of " + allowed.join(", "));
};

const bounded = (low, high, strictLow = false) => (value, path) => {
    number(value, path);
    require((strictLow ? value > low : value >= low) && value <= high, path,
        "number outside " + (strictLow ? "(" : "[") + low + ", " + high + "]");
};

function year(value, path) {
    integer(value, path);
    require(value >= 1000 && value <= 9999, path, "year must be 1000..9999");
}

function calendarDate(value, path, actor = false) {
    string(value, path);
    const pattern = actor ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/;
    require(pattern.test(value), path, "invalid date format");
    const [y, m = 1, d = 1] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(2000, m - 1, d));
    parsed.setUTCFullYear(y);
    require(y >= 1 && m >= 1 && m <= 12 && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d,
        path, "invalid calendar date");
    require(y >= (actor ? 1900 : 1000), path, "date year is outside the supported range");
}

function url(value, path) {
    nonempty(value, path);
    let valid = false;
    if (!/\s/.test(value)) {
        try {
            const parsed = new URL(value);
            valid = (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname !== "";
        } catch {
            valid = false;
        }
    }
    require(valid, path, "expected HTTP(S) URL; file paths and data URIs are not supported");
}

const fields = (names, check) => Object.fromEntries(names.split(" ").map((name) => [name, check]));

function objectCheck(value, path, spec, required = []) {
    require(isObject(value), path, "expected object");
    const unknown = Object.keys(value).filter((key) => !Object.hasOwn(spec, key)).sort();
    require(unknown.length === 0, path, "unknown fields: " + unknown.join(", "));
    const missing = required.filter((key) => !Object.hasOwn(value, key)).sort();
    require(missing.length === 0, path, "missing fields: " + missing.join(", "));
    for (const [key, item] of Object.entries(value)) spec[key](item, path + "." + key);
}

function role(value, path) {
    if (typeof value === "string") nonempty(value, path);
    else objectCheck(value, path, { ...fields("slug name character job department creditId", string),
        episodeCount: nullable(nonnegative), order: nullable(integer) });
}

function credit(value, path) {
    objectCheck(value, path, { ...fields("name", nonempty), ...fields("scraperPluginId providerId providerActorId originalName", string),
        aliases: array(string), roles: array(role), profileUrl: url,
        ...fields("sortOrder gender", nullable(integer)), episodeCount: nullable(nonnegative), popularity: nullable(number) }, ["name"]);
}

function photo(value, path) {
    if (typeof value === "string") url(value, path);
    else objectCheck(value, path, { url, type: choice("poster", "fanart", "landscape", "banner", "clearart",
        "clearlogo", "discart", "keyart", "default") }, ["url"]);
}

function customField(value, path) {
    objectCheck(value, path, { ...fields("metaKey fieldName", nonempty),
        fieldType: choice("text", "long_text", "url", "single_select", "multi_select"),
        value: (v, p) => (Array.isArray(v) ? array(string)(v, p) : string(v, p)),
        autoCreate: nullable(boolean) }, ["metaKey", "fieldName", "fieldType", "value"]);
    (value.fieldType === "multi_select" ? array(string) : string)(value.value, path + ".value");
}

function customFields(value, path) {
    array(customField)(value, path);
    const keys = value.map((item) => item.metaKey);
    require(keys.length === new Set(keys).size, path, "duplicate metaKey");
}

function externalIds(value, path, season = false) {
    const allowed = season ? ["tvdb", "tmdb", "wikidata"] : ["imdb", "tvdb", "tmdb", "wikidata"];
    array((item, location) => {
        objectCheck(item, location, { provider: choice(...allowed), id: nonempty }, ["provider", "id"]);
        if (item.provider === "imdb") require(/^tt[0-9]+$/.test(item.id), location + ".id", "IMDb TV IDs must retain their tt prefix");
    })(value, path);
    const providers = value.map((item) => item.provider);
    require(providers.length === new Set(providers).size, path, "duplicate external-ID provider");
}

function collection(value, path) {
    objectCheck(value, path, fields("id name overview", string));
}

function social(value, path) {
    objectCheck(value, path, { platform: nonempty, handle: nullable(string), url: nullable(url) }, ["platform"]);
}

function height(value, path) {
    string(value, path);
    require(/^[0-9]+(?:\.[0-9]+)?$/.test(value), path, "expected decimal centimetres as text, e.g. '175'");
}

const TV_RATING = nullable(bounded(0, 10, true));
const TV_BASE = { ...fields("title originalTitle description", nullable(string)), ...fields("year", nullable(year)),
    ...fields("firstAired", nullable(calendarDate)), rating: TV_RATING,
    ...fields("cast crew", array(credit)), externalIds,
    ...fields("poster backdrop banner", nullable(url)) };

function season(value, path) {
    const { originalTitle, ...base } = TV_BASE;
    objectCheck(value, path, { ...base, seasonNumber: nonnegative,
        ...fields("voteCount episodeCount", nullable(nonnegative)),
        externalIds: (v, p) => externalIds(v, p, true) }, ["seasonNumber"]);
}

function episode(value, path) {
    objectCheck(value, path, { ...fields("seasonNumber episodeNumber", nonnegative),
        ...fields("title originalTitle description productionCode episodeType", nullable(string)),
        releaseDate: nullable(calendarDate), rating: TV_RATING, voteCount: nullable(nonnegative), runtime: nullable(positive),
        ...fields("stillUrl poster banner", nullable(url)), externalIds,
        ...fields("cast guestStars crew directors writers", array(credit)) }, ["seasonNumber", "episodeNumber"]);
}

function catalog(value, path) {
    const entry = (item, location) => objectCheck(item, location, { episodeNumber: nonnegative, title: nullable(string) }, ["episodeNumber"]);
    objectCheck(value, path, { seasonNumber: nonnegative, episodes: array(entry) }, ["seasonNumber", "episodes"]);
}

function artwork(value, path) {
    objectCheck(value, path, { provider: nonempty, scope: choice("series", "season", "episode"),
        type: choice("poster", "backdrop", "banner", "logo", "clearart", "photo"), urlOrPath: url,
        thumbUrl: nullable(url), language: nullable(string), ...fields("width height", nullable(integer)), scoreOrLikes: nullable(number),
        ...fields("voteCount seasonNumber episodeNumber", nullable(nonnegative)), isSelected: boolean }, ["provider", "scope", "type", "urlOrPath"]);
    if (value.scope !== "series") {
        require(value.seasonNumber != null, path, "season/episode artwork requires seasonNumber");
        require(value.type !== "logo" && value.type !== "clearart", path, "logo/clearart only support series scope");
    }
    if (value.scope === "episode") require(value.episodeNumber != null, path, "episode artwork requires episodeNumber");
}

const IDENTITY = fields("id provider", nonempty);
const SPECS = {
    "media.search": { ...IDENTITY, title: nonempty, ...fields("number originalTitle", string),
        ...fields("thumbUrl coverUrl", url), releaseDate: calendarDate, score: bounded(0, 10), matchScore: bounded(0, 1) },
    "media.detail": { ...IDENTITY, ...fields("number title originalTitle summary maker label series imdbId tmdbId wikidataId releaseSource releaseGroup", string),
        ...fields("thumbUrl bigThumbUrl coverUrl bigCoverUrl previewVideoUrl sourceUrl", url), releaseDate: calendarDate,
        ...fields("score imdbRating", bounded(0, 10)), imdbVotes: nonnegative, photos: array(photo), ...fields("cast crew", array(credit)),
        ...fields("studios genres tags collections releaseFlags", array(string)), collectionDetails: array(collection), customFields },
    "actor.search": { ...IDENTITY, name: nonempty, avatar: url, matchScore: bounded(0, 1) },
    "actor.detail": { ...IDENTITY, name: nonempty, ...fields("description measurements nationality gender", string),
        ...fields("sourceUrl avatar", url), ...fields("aliases skills tags", array(string)), photos: array(url),
        ...fields("birthday debutDate", (v, p) => calendarDate(v, p, true)), height,
        socialLinks: array(social), customFields },
    "tv.search": { ...IDENTITY, title: nonempty, ...fields("originalTitle status network overview originalLanguage", nullable(string)),
        year: nullable(year), firstAired: nullable(calendarDate), ...fields("posterUrl backdropUrl", nullable(url)),
        rating: TV_RATING, voteCount: nullable(nonnegative), popularity: nullable(number), originCountries: array(string),
        adult: nullable(boolean), genreIds: array(integer), externalIds, matchScore: bounded(0, 1) },
    "tv.detail": { ...IDENTITY, ...TV_BASE, ...fields("tagline contentRating tvStatus", nullable(string)), lastAired: nullable(calendarDate),
        averageRuntime: nullable(positive), ...fields("aliases tvGenre network tvStudio tvTag", array(string)),
        ...fields("logo clearart trailer sourceUrl", nullable(url)), photos: array(photo), seasons: array(season),
        episodes: array(episode), episodeCatalogs: nullable(array(catalog)), artworks: array(artwork), customFields },
};

// Search can return concrete providers from an aggregator. The caller may supply
// that capability's manifest allowlist; standalone checks keep exact matching.
export function checkResult(capability, operation, data, provider, allowedSearchProviders) {
    const spec = SPECS[capability + "." + operation];
    if (!spec) throw new InvalidResult("unknown capability/operation: " + capability + " " + operation);
    const required = ["id", "provider", ...(capability === "actor" ? ["name"] : operation === "search" ? ["title"] : [])];
    const item = (value, path) => {
        objectCheck(value, path, spec, required);
        if (operation === "search" && allowedSearchProviders != null) {
            require(allowedSearchProviders.includes(value.provider), path + ".provider", "provider is not declared for " + capability + ": " + value.provider);
        } else if (provider != null) {
            require(value.provider === provider, path + ".provider", "does not match expected provider " + provider);
        }
    };
    (operation === "search" ? array(item) : item)(data, "$");
}

export function checkTestResult(data) {
    require(isObject(data), "$", "test(ctx) must return { ok: true } or { ok: false, error }");
    objectCheck(data, "$", { ok: boolean, error: string }, ["ok"]);
}

// Verifies the request-scope rules from docs/contract.md for a TV detail result.
export function checkTvScope(result, scope) {
    if (scope == null) return;
    const requested = new Map(scope.seasons.map((season) => [season.seasonNumber, new Set(season.episodeNumbers)]));
    (result.seasons ?? []).forEach((season, index) => {
        const episodes = requested.get(season.seasonNumber);
        require(episodes !== undefined && episodes.size > 0, "$.seasons[" + index + "]",
            "season " + season.seasonNumber + " is outside tvScope or has no local episodes");
    });
    (result.episodes ?? []).forEach((episode, index) => {
        require(requested.get(episode.seasonNumber)?.has(episode.episodeNumber) === true, "$.episodes[" + index + "]",
            "S" + episode.seasonNumber + "E" + episode.episodeNumber + " is outside tvScope");
    });
    const catalogs = new Set();
    (result.episodeCatalogs ?? []).forEach((entry, index) => {
        const path = "$.episodeCatalogs[" + index + "]";
        require(requested.has(entry.seasonNumber), path, "season " + entry.seasonNumber + " catalog is outside tvScope");
        require(!catalogs.has(entry.seasonNumber), path, "duplicate catalog for season " + entry.seasonNumber);
        catalogs.add(entry.seasonNumber);
    });
    (result.artworks ?? []).forEach((art, index) => {
        if (art.scope === "series") return;
        const episodes = requested.get(art.seasonNumber);
        const ok = art.scope === "season" ? episodes?.size > 0 : episodes?.has(art.episodeNumber) === true;
        require(ok, "$.artworks[" + index + "]", art.scope + " artwork is outside tvScope");
    });
}
