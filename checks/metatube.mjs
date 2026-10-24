import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { configDefaults, invoke, loadPlugin } from "../tools/lib/sandbox.mjs";
import { checkResult, checkTestResult } from "../tools/lib/results.mjs";
import { readZip } from "../tools/lib/zip.mjs";
import { ROOT, cli, pluginDirectory, tempDir, writeJson } from "./helpers.mjs";

const PLUGIN = pluginDirectory("INSCURA_METATUBE_PLUGIN_DIR");
const FIXTURES = path.join(ROOT, "examples", "metatube", "fixtures", "api.json");
const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8"));
const source = fs.readFileSync(path.join(PLUGIN, manifest.entry), "utf8");
const base = "https://metatube.example.invalid";
const defaults = configDefaults(manifest);
const data = (result) => JSON.parse(JSON.stringify(result.value));
const custom = (value) => Object.fromEntries((value.customFields ?? []).map((f) => [f.metaKey, f.value]));
const recommendedControls = {
    apiUrl: { type: "text", default: "", required: true },
    apiToken: { type: "password", default: "" },
    movieProviders: { type: "multiSelect", default: ["default"], options: ["default", "FANZA", "JavBus"] },
    actorProviders: { type: "multiSelect", default: ["default"], options: ["default", "Gfriends"] },
    fallback: { type: "boolean", default: true },
    detailMode: { type: "select", default: "full", options: ["full", "lazy"] },
    includeImages: { type: "boolean", default: true },
    imageMode: { type: "select", default: "proxy", options: ["direct", "proxy"] },
    includePreviewImages: { type: "boolean", default: true },
    maxPreviewImages: { type: "number", default: 20, min: 0, max: 100 },
    previewVideoMode: { type: "select", default: "auto", options: ["auto", "hls", "mp4", "off"] },
    includeReviews: { type: "boolean", default: false },
    maxReviews: { type: "number", default: 5, min: 0, max: 50 },
    includeActorExtendedFields: { type: "boolean", default: true },
    includeCustomFields: { type: "boolean", default: true },
    requestTimeout: { type: "number", default: 30, min: 5, max: 180 }
};

async function run(method, input, provider, config = {}, fixture = FIXTURES, expectError = false) {
    const result = await invoke({ plugin: loadPlugin(source), manifest, method, input, provider,
        config: { apiUrl: base, ...config }, fetchMode: "fixtures", fixtures: fixture, log() {} });
    assert.deepEqual(result.http.unmatched, [], "fixture coverage must not masquerade as an expected error");
    if (expectError) {
        assert.equal(result.ok, false);
        assert.equal(result.errorIsError, true);
        return result;
    }
    assert.equal(result.ok, true, result.errorMessage);
    if (method === "test") checkTestResult(result.value);
    else checkResult(result.capability, result.operation, result.value, result.provider,
        result.operation === "search" ? manifest.providers[result.capability].map((p) => p.id) : undefined);
    if (result.operation === "detail") assert.equal(result.value.id, input);
    return result;
}

const movie = (config = {}, fixture) => run("getMediaDetail", "movie-1", "FANZA", config, fixture);
const actor = (config = {}, fixture) => run("getActorDetail", "actor-1", "Gfriends", config, fixture);

test("MetaTube validates and has self-contained five-language settings and field declarations", (t) => {
    t.diagnostic(`Plugin under test: ${manifest.id}@${manifest.version} (${PLUGIN})`);
    const result = cli("validate", PLUGIN);
    assert.equal(result.status, 0, result.stderr);
    for (const [key, expected] of Object.entries(recommendedControls)) {
        const control = manifest.config.find((field) => field.key === key);
        assert.ok(control, `recommended control ${key} must be declared in manifest.config`);
        assert.equal(control.type, expected.type, `${key}.type`);
        assert.equal(control.required ?? false, expected.required ?? false, `${key}.required`);
        assert.deepEqual(control.default, expected.default, `${key}.default`);
        for (const bound of ["min", "max"]) if (bound in expected) assert.equal(control[bound], expected[bound], `${key}.${bound}`);
        for (const option of expected.options ?? []) {
            assert.ok(control.options?.some((candidate) => candidate.value === option), `${key} must expose option ${option}`);
        }
    }
    const languages = ["en", "zh-CN", "zh-TW", "ja", "ko"];
    for (const control of manifest.config) {
        for (const labels of [control.label, control.help, control.placeholder, ...(control.options ?? []).map((o) => o.label)].filter(Boolean)) {
            assert.ok(languages.every((lang) => typeof labels[lang] === "string" && labels[lang].trim()));
        }
    }
    for (const [capability, fields] of Object.entries(manifest.scrapeFields)) {
        for (const provider of manifest.providers[capability]) assert.ok(fields.some((f) => f.provider === provider.id));
        for (const field of fields) {
            assert.ok(languages.every((lang) => field.label[lang]));
            assert.equal(typeof field.translatable, "boolean");
            if (["metatube_id", "metatube_provider", "duration_minutes", "homepage", "thumb_url", "cover_url", "preview_video_hls_url", "review_count", "code", "rating", "releaseDate", "birthday", "debutDate", "height", "measurements", "blood_type", "cup_size", "avatar", "photos", "portraitCover", "backdrop", "previewVideo"].includes(field.key)) assert.equal(field.translatable, false);
            if (["title", "description", "cast", "crew", "roles", "genres", "reviews", "hobby", "actor_aliases"].includes(field.key)) assert.equal(field.translatable, true);
        }
    }
});

test("MetaTube protected test, optional bearer headers and timeout clamps are real request behavior", async () => {
    const plugin = loadPlugin(source).exports;
    for (const [token, seconds, expectedMs] of [["", 1, 5000], ["synthetic-token-only", 12, 12000], ["synthetic-token-only", 900, 180000]]) {
        const calls = [];
        await plugin.test({ config: { ...defaults, apiUrl: base, apiToken: token, requestTimeout: seconds }, request: {}, fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, status: 200, json: async () => ({ data: { version: "synthetic" } }) };
        } });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, base + "/v1/db/version");
        assert.equal(calls[0].options.headers.Authorization, token ? "Bearer " + token : undefined);
        assert.equal(calls[0].options.timeoutMs, expectedMs);
        assert.equal(calls[0].options.headers["User-Agent"], "Inscura-" + manifest.id + "/" + manifest.version);
    }
    await run("test");
    for (const url of ["", "file:///tmp/private", "https://user:password@example.org", "https://example.org?token=value", "https://example.org#fragment"]) {
        const result = await run("test", undefined, undefined, { apiUrl: url }, FIXTURES, true);
        assert.equal(result.http.requests.length, 0);
    }
});

test("MetaTube movie and actor methods use current fields, source units and declared custom keys", async () => {
    const mediaSearch = data(await run("searchMedia", "match", "FANZA"));
    assert.equal(mediaSearch.length, 1);
    assert.equal(mediaSearch[0].id, "movie-1");
    assert.equal(mediaSearch[0].score, 9);
    assert.equal(mediaSearch[0].thumbUrl, base + "/v1/images/primary/FANZA/movie-1");
    const detail = data(await movie({ includeReviews: true, maxReviews: 2 }));
    assert.equal(detail.number, "EXAMPLE-001");
    assert.equal(detail.score, 9);
    assert.equal(detail.releaseDate, "2024-06-15");
    assert.equal(custom(detail).duration_minutes, "95");
    assert.equal(custom(detail).review_count, "2");
    assert.equal(detail.photos.length, 3);
    assert.equal(detail.cast[0].roles[0].slug, "actor");
    assert.equal(detail.cast[0].providerActorId, undefined);
    assert.equal(detail.crew[0].roles[0].slug, "director");
    for (const obsolete of ["code", "description", "rating", "runtime", "duration", "screenshotUrl"]) assert.equal(detail[obsolete], undefined);
    const actorSearch = data(await run("searchActors", "match", "Gfriends"));
    assert.equal(actorSearch[0].id, "actor-1");
    const person = data(await actor());
    assert.equal(person.height, "170");
    assert.equal(person.birthday, "1992-04-16");
    assert.equal(person.debutDate, "2014-08-20");
    assert.ok(person.photos.every((url) => typeof url === "string"));
    assert.deepEqual(person.skills, ["Landscape photography"]);
    for (const [capability, value] of [["media", detail], ["actor", person]]) {
        for (const field of value.customFields ?? []) assert.ok(manifest.scrapeFields[capability].some((f) => f.provider === value.provider && f.kind === "custom" && f.key === field.metaKey && f.fieldType === field.fieldType));
    }
});

test("MetaTube installed defaults preserve all available source image categories", async () => {
    // The harness merges manifest defaults just as the host does; do not force images on.
    const search = data(await run("searchMedia", "match", "FANZA"))[0];
    assert.equal(search.thumbUrl, base + "/v1/images/primary/FANZA/movie-1");
    const detail = data(await movie());
    for (const [field, kind] of Object.entries({ thumbUrl: "primary", bigThumbUrl: "primary", coverUrl: "backdrop", bigCoverUrl: "backdrop" })) {
        assert.equal(detail[field], base + "/v1/images/" + kind + "/FANZA/movie-1", field);
    }
    assert.deepEqual(detail.photos, [1, 2, 3].map((i) => "https://example.org/images/garden-0" + i + ".png"));
    assert.equal(custom(detail).thumb_url, "https://example.org/images/poster-small.png");
    assert.equal(custom(detail).cover_url, "https://example.org/images/cover-small.png");
    const personSearch = data(await run("searchActors", "match", "Gfriends"))[0];
    const person = data(await actor());
    assert.equal(personSearch.avatar, base + "/v1/images/primary/Gfriends/actor-1");
    assert.equal(person.avatar, personSearch.avatar);
    assert.deepEqual(person.photos, ["https://example.org/images/actor-01.png", "https://example.org/images/actor-02.png"]);
    assert.equal(data(await run("searchMedia", "match", "FANZA", { includeImages: false }))[0].thumbUrl, undefined);
    assert.equal(data(await run("searchActors", "match", "Gfriends", { includeImages: false }))[0].avatar, undefined);
});

test("MetaTube preserves real provider identity through native, default and aggregate searches", async () => {
    const native = await run("searchMedia", "match", "FANZA", { movieProviders: ["JavBus"] });
    assert.equal(native.http.requests.length, 1);
    assert.match(native.http.requests[0], /provider=FANZA/);
    const aggregate = await run("searchMedia", "match", "MetaTube", { movieProviders: ["FANZA", "JavBus", "FANZA"] });
    assert.deepEqual(data(aggregate).map((v) => [v.provider, v.id]), [["FANZA", "movie-1"], ["JavBus", "movie-1"]]);
    assert.equal(aggregate.http.requests.length, 2);
    assert.equal(data(aggregate)[1].score, undefined); // JavBus scale was not verified.
    for (const selection of [[], ["default"], ["default", "JavBus"]]) {
        const result = await run("searchMedia", "match", "MetaTube", { movieProviders: selection });
        assert.ok(result.http.requests.every((request) => !request.includes("provider=")));
        assert.equal(data(result)[0].provider, "FANZA");
    }
    for (const selection of [[], ["default"], ["Gfriends", "Gfriends"]]) {
        const result = await run("searchActors", "match", "MetaTube", { actorProviders: selection });
        assert.equal(result.http.requests.length, 1);
        assert.equal(data(result)[0].provider, "Gfriends");
    }
    const realDetail = await run("getMediaDetail", "movie-1", "JavBus");
    assert.equal(data(realDetail).provider, "JavBus");
    await run("getMediaDetail", "movie-1", "MetaTube", {}, FIXTURES, true);
    await run("searchMedia", "match", "MetaTube", { movieProviders: ["unregistered"] }, FIXTURES, true);
    for (const [method, provider] of [["searchMedia", "FANZA"], ["searchActors", "Gfriends"]]) await run(method, "unknown", provider, {}, FIXTURES, true);
});

test("MetaTube search emptiness, null details and HTTP/envelope/identity errors remain distinct", async () => {
    for (const [search, detail, provider] of [["searchMedia", "getMediaDetail", "FANZA"], ["searchActors", "getActorDetail", "Gfriends"]]) {
        for (const query of ["none", "empty"]) assert.deepEqual(data(await run(search, query, provider)), []);
        const minimal = data(await run(detail, "minimal", provider, { includeImages: true, includeCustomFields: false }));
        assert.ok(!Object.values(minimal).includes(null));
        for (const field of ["score", "birthday", "releaseDate", "height", "photos", "genres", "aliases", "thumbUrl", "bigThumbUrl", "coverUrl", "bigCoverUrl", "avatar"]) assert.equal(minimal[field], undefined);
        for (const id of ["error401", "error403", "error404", "error429", "error500", "invalid-json", "network", "malformed", "wrong-id", "wrong-provider"]) {
            const failed = await run(detail, id, provider, { apiToken: "synthetic-token-only" }, FIXTURES, true);
            assert.ok(!failed.errorMessage.includes("synthetic-token-only"));
        }
        await run(search, "malformed", provider, {}, FIXTURES, true);
    }
});

test("MetaTube image controls change primary URLs and preview counts without leaking tokens", async () => {
    const direct = data(await movie({ includeImages: true, imageMode: "direct", maxPreviewImages: 2 }));
    for (const [field, file] of Object.entries({ thumbUrl: "poster-small.png", bigThumbUrl: "poster-large.png", coverUrl: "cover-small.png", bigCoverUrl: "cover-large.png" })) {
        assert.equal(direct[field], "https://example.org/images/" + file, field);
    }
    assert.equal(data(await actor({ imageMode: "direct" })).avatar, "https://example.org/images/actor-01.png");
    assert.equal(direct.photos.length, 2);
    const proxy = data(await movie({ includeImages: true, imageMode: "proxy", apiToken: "synthetic-token-only" }));
    assert.equal(proxy.thumbUrl, base + "/v1/images/primary/FANZA/movie-1");
    assert.equal(proxy.coverUrl, base + "/v1/images/backdrop/FANZA/movie-1");
    assert.ok(proxy.photos.every((url) => url.startsWith("https://example.org/")));
    assert.ok(!JSON.stringify(proxy).includes("synthetic-token-only"));
    for (const config of [{ includeImages: false }, { includeImages: true, includePreviewImages: false }, { includeImages: true, maxPreviewImages: 0 }]) {
        const result = data(await movie(config));
        assert.equal(result.photos, undefined);
        if (!config.includeImages) {
            for (const key of ["thumbUrl", "bigThumbUrl", "coverUrl", "bigCoverUrl"]) assert.equal(result[key], undefined);
            for (const key of ["thumb_url", "cover_url"]) assert.equal(custom(result)[key], undefined);
        }
    }
    assert.equal(data(await actor({ includeImages: true, imageMode: "proxy" })).avatar, base + "/v1/images/primary/Gfriends/actor-1");
    const noActorImages = data(await actor({ includeImages: false }));
    assert.equal(noActorImages.avatar, undefined);
    assert.equal(noActorImages.photos, undefined);
});

test("MetaTube preview video formats, lazy detail and fallback settings reach the API", async () => {
    for (const [previewVideoMode, suffix] of [["auto", ".m3u8"], ["hls", ".m3u8"], ["mp4", ".mp4"], ["off", null]]) {
        const value = data(await movie({ previewVideoMode }));
        if (suffix) assert.ok(value.previewVideoUrl.endsWith(suffix));
        else { assert.equal(value.previewVideoUrl, undefined); assert.equal(custom(value).preview_video_hls_url, undefined); }
    }
    const lazy = await movie({ detailMode: "lazy", includeReviews: true });
    assert.ok(lazy.http.requests.every((url) => url.endsWith("lazy=true")));
    const full = await movie({ detailMode: "full", includeReviews: true });
    assert.ok(full.http.requests.every((url) => url.endsWith("lazy=false")));
    for (const fallback of [false, true]) assert.ok((await run("searchMedia", "match", "FANZA", { fallback })).http.requests[0].endsWith("fallback=" + fallback));
});

test("MetaTube reviews, source custom fields and actor extensions have independent switches", async () => {
    for (const config of [{ includeReviews: false }, { includeReviews: true, maxReviews: 0 }]) {
        const result = await movie(config);
        assert.equal(result.http.requests.length, 1);
        assert.equal(custom(data(result)).reviews, undefined);
    }
    for (const count of [1, 2]) {
        const result = await movie({ includeReviews: true, maxReviews: count, includeCustomFields: false });
        assert.equal(result.http.requests.length, 2);
        assert.deepEqual(Object.keys(custom(data(result))).sort(), ["review_count", "reviews"]);
        assert.equal(custom(data(result)).review_count, String(count));
    }
    const noSource = data(await movie({ includeCustomFields: false }));
    assert.equal(noSource.customFields, undefined);
    for (const extended of [false, true]) for (const includeCustomFields of [false, true]) {
        const person = data(await actor({ includeActorExtendedFields: extended, includeCustomFields }));
        assert.equal(Boolean(person.height), extended);
        assert.equal(Boolean(person.aliases), extended);
        assert.equal(Boolean(custom(person).hobby), extended);
        assert.equal(Boolean(custom(person).actor_aliases), extended);
        assert.equal(Boolean(custom(person).metatube_id), includeCustomFields);
        assert.ok(person.description); // Biography is not disabled with extensions.
    }
});

test("MetaTube rejects bad settings, suppresses unknown rating scales and does not hide review failure", async (t) => {
    for (const config of [{ maxPreviewImages: "two", includeImages: true }, { maxReviews: "five" }, { imageMode: "unknown", includeImages: true }, { detailMode: "unknown" }, { previewVideoMode: "unknown" }]) {
        await run("getMediaDetail", "movie-1", "FANZA", config, FIXTURES, true);
    }
    const fixture = JSON.parse(fs.readFileSync(FIXTURES, "utf8"));
    const dir = tempDir(t);
    for (const value of [0, -1, 5.1, null, "4.5"]) {
        const modified = structuredClone(fixture);
        modified.requests.find((r) => r.url === base + "/v1/movies/FANZA/movie-1?lazy=false").json.data.score = value;
        const file = writeJson(path.join(dir, "rating.json"), modified);
        assert.equal(data(await movie({}, file)).score, undefined);
    }
    for (const row of fixture.requests) if (row.url.includes("/v1/reviews/")) { delete row.json; row.status = 429; row.text = "Synthetic rate limit"; }
    const file = writeJson(path.join(dir, "review-error.json"), fixture);
    await run("getMediaDetail", "movie-1", "FANZA", { includeReviews: true }, file, true);
});

test("MetaTube packaging excludes fixtures and local test defaults", (t) => {
    const dir = tempDir(t);
    const copy = path.join(dir, "metatube-copy");
    const originalReadme = fs.readFileSync(path.join(PLUGIN, "README.md"));
    const originalManifest = fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8");
    fs.cpSync(PLUGIN, copy, { recursive: true }); // pack refreshes README; never mutate the target plugin in tests.
    const output = path.join(dir, "plugin.zip");
    const result = cli("pack", copy, output);
    assert.equal(result.status, 0, result.stderr);
    const entries = readZip(fs.readFileSync(output));
    const expectedFiles = ["README.md", manifest.entry, "manifest.json", ...["ATTRIBUTION.md", "LICENSE"].filter((file) => fs.existsSync(path.join(PLUGIN, file)))];
    assert.deepEqual([...entries.keys()], expectedFiles.sort());
    for (const content of entries.values()) assert.doesNotMatch(content.toString(), /\/Users\/|\/Volumes\/|localhost:8080|127\.0\.0\.1/);
    assert.equal(JSON.parse(entries.get("manifest.json")).id, manifest.id);
    assert.equal(JSON.parse(entries.get("manifest.json")).version, manifest.version);
    assert.equal(entries.get(manifest.entry).toString(), source);
    assert.deepEqual(fs.readFileSync(path.join(PLUGIN, "README.md")), originalReadme);
    assert.equal(fs.readFileSync(path.join(PLUGIN, manifest.entry), "utf8"), source);
    assert.equal(fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8"), originalManifest);
});
