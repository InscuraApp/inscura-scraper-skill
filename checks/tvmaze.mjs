import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readZip } from "../tools/lib/zip.mjs";
import { TVMAZE_FIXTURES, cli, pluginDirectory, tempDir } from "./helpers.mjs";

const TVMAZE = pluginDirectory("INSCURA_TVMAZE_PLUGIN_DIR");

const run = (...args) => cli("run", TVMAZE, ...args, "--fixtures", TVMAZE_FIXTURES);
const json = (result) => JSON.parse(result.stdout);
const manifest = JSON.parse(fs.readFileSync(path.join(TVMAZE, "manifest.json"), "utf8"));

test("TVmaze plugin validates", (t) => {
    t.diagnostic(`Plugin under test: ${manifest.id}@${manifest.version} (${TVMAZE})`);
    const result = cli("validate", TVMAZE);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`PASS ${manifest.id}@${manifest.version}`), result.stdout);
});

test("test(ctx) succeeds", () => {
    const result = run("test", "--check");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(json(result), { ok: true });
});

test("searchTv maps candidates and preserves available images by default", () => {
    const result = run("searchTv", "Demo Show", "--check");
    assert.equal(result.status, 0, result.stderr);
    const [first, second] = json(result);
    assert.equal(first.id, "101");
    assert.equal(first.overview, "A synthetic show & nothing more.");
    assert.equal(first.network, "Demo Network");
    assert.deepEqual(first.externalIds, [{ provider: "imdb", id: "tt0000101" }, { provider: "tvdb", id: "5101" }]);
    assert.equal(first.posterUrl, "https://static.example.invalid/o.jpg");
    assert.equal(second.posterUrl, undefined);
    assert.equal(second.year, undefined);
});

test("explicit includeImages=false omits poster URLs", () => {
    const result = run("searchTv", "Demo Show", "--check", "--config", '{"includeImages":false}');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(json(result)[0].posterUrl, undefined);
});

test("no match is an empty array", () => {
    const result = run("searchTv", "Nothing Matches", "--check");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(json(result), []);
});

test("getTvDetail without scope returns everything with official numbering", () => {
    const result = run("getTvDetail", "101", "--check");
    assert.equal(result.status, 0, result.stderr);
    const detail = json(result);
    assert.deepEqual(detail.network, ["Demo Network", "Demo Stream"]);
    assert.deepEqual(detail.seasons.map((season) => season.seasonNumber), [0, 1, 2]);
    assert.deepEqual(detail.episodes.map((e) => e.seasonNumber + "x" + e.episodeNumber), ["0x0", "1x1", "1x2", "1x3", "2x1", "2x2"]);
    assert.equal(detail.episodes.find((e) => e.episodeNumber === 2 && e.seasonNumber === 1).runtime, undefined);
    assert.equal(detail.cast[0].roles[0].character, "Demo Role");
});

test("getTvDetail honours tvScope: details for local episodes, full catalogs for requested seasons", () => {
    const scope = '{"seasons":[{"seasonNumber":1,"episodeNumbers":[1,2]},{"seasonNumber":2,"episodeNumbers":[]}]}';
    const result = run("getTvDetail", "101", "--check", "--scope", scope);
    assert.equal(result.status, 0, result.stderr);
    const detail = json(result);
    assert.deepEqual(detail.seasons.map((season) => season.seasonNumber), [1]);
    assert.deepEqual(detail.episodes.map((e) => e.seasonNumber + "x" + e.episodeNumber), ["1x1", "1x2"]);
    assert.deepEqual(detail.episodeCatalogs.map((c) => [c.seasonNumber, c.episodes.length]), [[1, 3], [2, 2]]);
});

test("empty tvScope returns show metadata only", () => {
    const result = run("getTvDetail", "101", "--check", "--scope", '{"seasons":[]}');
    assert.equal(result.status, 0, result.stderr);
    const detail = json(result);
    assert.equal(detail.title, "Demo Show");
    assert.deepEqual([detail.seasons, detail.episodes, detail.episodeCatalogs], [[], [], []]);
});

for (const [id, message] of [["999", /HTTP 404/], ["998", /invalid JSON/], ["997", /HTTP 429/], ["996", /network request failed/]]) {
    test("getTvDetail " + id + " fails cleanly", () => {
        const result = run("getTvDetail", id, "--expect-error");
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, message);
    });
}

test("actor search and detail", () => {
    const search = run("searchActors", "Demo Actor", "--check");
    assert.equal(search.status, 0, search.stderr);
    assert.deepEqual(json(search), [{ id: "201", provider: "tvmaze", name: "Demo Actor", matchScore: 0.9 / 1.9 }]);
    const detail = run("getActorDetail", "201", "--check");
    assert.equal(detail.status, 0, detail.stderr);
    assert.equal(json(detail).birthday, "1970-01-02");
    assert.equal(json(detail).nationality, undefined);
});

test("pack contains only installable plugin files and preserves source identity", (t) => {
    const dir = tempDir(t);
    const copy = path.join(dir, "plugin");
    const originalReadme = fs.readFileSync(path.join(TVMAZE, "README.md"));
    const originalSource = fs.readFileSync(path.join(TVMAZE, manifest.entry), "utf8");
    const originalManifest = fs.readFileSync(path.join(TVMAZE, "manifest.json"), "utf8");
    fs.cpSync(TVMAZE, copy, { recursive: true });
    const first = cli("pack", copy, path.join(dir, "a.zip"));
    assert.equal(first.status, 0, first.stderr);
    const files = readZip(fs.readFileSync(path.join(dir, "a.zip")));
    assert.deepEqual([...files.keys()], ["ATTRIBUTION.md", "LICENSE", "README.md", manifest.entry, "manifest.json"].sort());
    assert.equal(files.get(manifest.entry).toString(), originalSource);
    assert.equal(JSON.parse(files.get("manifest.json")).id, manifest.id);
    assert.equal(JSON.parse(files.get("manifest.json")).version, manifest.version);
    assert.equal(fs.readFileSync(path.join(TVMAZE, manifest.entry), "utf8"), originalSource);
    assert.equal(fs.readFileSync(path.join(TVMAZE, "manifest.json"), "utf8"), originalManifest);
    assert.deepEqual(fs.readFileSync(path.join(TVMAZE, "README.md")), originalReadme);
});

test("TVmaze relevance preserves TV and actor order without inventing probability", (t) => {
    const dir = tempDir(t);
    const fixture = path.join(dir, "relevance.json");
    const scores = [2, 1.1, 0.2, 0, -1, null, "1", undefined];
    const requests = ["shows", "people"].map((kind) => ({
        url: "https://api.tvmaze.com/search/" + kind + "?q=Rank%20Test",
        json: scores.map((score, index) => ({
            score,
            [kind === "shows" ? "show" : "person"]: {
                id: index + 1,
                name: index === 0 ? "Exact Match" : "Similar Match " + index,
                premiered: index === 0 ? "2008-01-20" : "2024-01-01"
            }
        }))
    }));
    fs.writeFileSync(fixture, JSON.stringify({ requests }));
    for (const method of ["searchTv", "searchActors"]) {
        const result = cli("run", TVMAZE, method, "Rank Test", "--fixtures", fixture, "--check");
        assert.equal(result.status, 0, result.stderr);
        const output = json(result);
        assert.deepEqual(output.slice(0, 4).map((item) => item.matchScore), scores.slice(0, 4).map((score) => score / (1 + score)));
        assert.ok(output.slice(4).every((item) => item.matchScore === undefined));
        const hostOrder = [...output].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0) || (b.year ?? 0) - (a.year ?? 0));
        assert.equal(hostOrder[0].id, "1");
        assert.ok(output[0].matchScore > output[1].matchScore); // Both upstream scores exceed 1.
    }
});

function enrichedFixture(t) {
    const fixture = JSON.parse(fs.readFileSync(TVMAZE_FIXTURES, "utf8"));
    const show = fixture.requests.find((entry) => entry.url === "https://api.tvmaze.com/shows/101?embed=cast").json;
    show.image = { original: "https://static.example.invalid/show.png" };
    const { _embedded, ...withoutCast } = show;
    fixture.requests.push(
        { url: "https://api.tvmaze.com/shows/101", json: withoutCast },
        { url: "https://api.tvmaze.com/shows/101/crew", json: [{ type: "Executive Producer", person: { id: 201, name: "Demo Actor" } }] },
        { url: "https://api.tvmaze.com/shows/101/akas", json: [{ name: "Alternate Show" }, { name: "Alternate Show" }, { name: "Another Name" }] }
    );
    fixture.requests.find((entry) => entry.url.endsWith("/101/seasons")).json[1].image = { original: "https://static.example.invalid/season.png" };
    fixture.requests.find((entry) => entry.url.endsWith("/101/episodes?specials=1")).json[2].image = { original: "https://static.example.invalid/episode.png" };
    fixture.requests.find((entry) => entry.url.endsWith("/people/201")).json.image = { original: "https://static.example.invalid/person.png" };
    const file = path.join(tempDir(t), "options.json");
    fs.writeFileSync(file, JSON.stringify(fixture));
    return file;
}

test("recommended defaults and five-language definitions are complete", () => {
    const defaults = Object.fromEntries(manifest.config.map((field) => [field.key, field.default]));
    for (const [key, value] of Object.entries({
        includeImages: true, includeCast: true, includeCrew: false, includeAliases: false
    })) assert.equal(defaults[key], value, key);
    const labels = [
        ...Object.values(manifest.providers).flat().map((field) => field.label),
        ...manifest.config.flatMap((field) => [field.label, field.help]),
        ...Object.values(manifest.scrapeFields).flat().map((field) => field.label)
    ];
    for (const label of labels) {
        for (const locale of ["en", "zh-CN", "zh-TW", "ja", "ko"]) {
            assert.equal(typeof label[locale], "string");
            assert.ok(label[locale].trim());
        }
    }
    assert.equal(manifest.scrapeFields.actor.find((field) => field.key === "gender").translatable, false);
    assert.ok(manifest.scrapeFields.tv.filter((field) => ["cast", "crew"].includes(field.key)).every((field) => field.translatable));
    const result = run("getTvDetail", "101", "--check");
    assert.equal(result.status, 0, result.stderr);
    const detail = json(result);
    assert.equal(detail.crew, undefined);
    assert.equal(detail.aliases, undefined);
    assert.equal(detail.poster, undefined);
    assert.equal(detail.cast[0].scraperPluginId, manifest.id);
    assert.equal(detail.cast[0].providerId, "tvmaze");
    assert.equal(detail.cast[0].providerActorId, "201");
    assert.equal((result.stderr.match(/GET https:/g) || []).length, 3);
});

test("TVmaze installed defaults preserve show, season, episode and person images", (t) => {
    const fixture = enrichedFixture(t);
    const runDefault = (...args) => {
        const result = cli("run", TVMAZE, ...args, "--fixtures", fixture, "--check");
        assert.equal(result.status, 0, result.stderr);
        return json(result);
    };
    const detail = runDefault("getTvDetail", "101", "--scope", '{"seasons":[{"seasonNumber":1,"episodeNumbers":[1]}]}');
    assert.equal(detail.poster, "https://static.example.invalid/show.png");
    assert.equal(detail.seasons[0].poster, "https://static.example.invalid/season.png");
    assert.equal(detail.episodes[0].stillUrl, "https://static.example.invalid/episode.png");
    assert.equal(runDefault("getActorDetail", "201").avatar, "https://static.example.invalid/person.png");
    // Search fixtures include both an image and a genuine missing-image candidate.
    assert.equal(runDefault("searchTv", "Demo Show")[0].posterUrl, "https://static.example.invalid/o.jpg");
    assert.equal(runDefault("searchTv", "Demo Show")[1].posterUrl, undefined);
});

test("source options change requests/output without expanding scope", (t) => {
    const fixture = enrichedFixture(t);
    const scope = JSON.stringify({ seasons: [{ seasonNumber: 1, episodeNumbers: [1] }, { seasonNumber: 2, episodeNumbers: [] }] });
    for (const config of [
        { includeCast: false, includeCrew: false, includeAliases: false, includeImages: false },
        { includeCast: true, includeCrew: true, includeAliases: true, includeImages: true },
        { includeCast: false, includeCrew: true, includeAliases: false, includeImages: false },
        { includeCast: false, includeCrew: false, includeAliases: true, includeImages: false }
    ]) {
        const result = cli("run", TVMAZE, "getTvDetail", "101", "--fixtures", fixture, "--check", "--scope", scope, "--config", JSON.stringify(config));
        assert.equal(result.status, 0, result.stderr);
        const detail = json(result);
        assert.equal(Array.isArray(detail.cast), config.includeCast);
        assert.equal(Array.isArray(detail.crew), config.includeCrew);
        assert.equal(Array.isArray(detail.aliases), config.includeAliases);
        assert.equal(result.stderr.includes("?embed=cast"), config.includeCast);
        assert.equal(result.stderr.includes("/101/crew"), config.includeCrew);
        assert.equal(result.stderr.includes("/101/akas"), config.includeAliases);
        assert.equal((result.stderr.match(/GET https:/g) || []).length, 3 + Number(config.includeCrew) + Number(config.includeAliases));
        assert.deepEqual(detail.episodes.map((episode) => [episode.seasonNumber, episode.episodeNumber]), [[1, 1]]);
        assert.deepEqual(detail.episodeCatalogs.map((catalog) => [catalog.seasonNumber, catalog.episodes.length]), [[1, 3], [2, 2]]);
        assert.equal(Boolean(detail.poster), config.includeImages);
        assert.equal(Boolean(detail.seasons[0].poster), config.includeImages);
        assert.equal(Boolean(detail.episodes[0].stillUrl), config.includeImages);
        if (config.includeCrew) {
            assert.equal(detail.crew[0].scraperPluginId, manifest.id);
            assert.equal(detail.crew[0].providerId, "tvmaze");
            assert.equal(detail.crew[0].providerActorId, "201");
            assert.deepEqual(detail.crew[0].roles[0], { slug: "executive-producer", name: "Executive Producer", job: "Executive Producer" });
        }
        if (config.includeAliases) assert.deepEqual(detail.aliases, ["Alternate Show", "Another Name"]);
    }
    const empty = cli("run", TVMAZE, "getTvDetail", "101", "--fixtures", fixture, "--check", "--scope", '{"seasons":[]}', "--config", '{"includeCrew":true,"includeAliases":true}');
    assert.equal(empty.status, 0, empty.stderr);
    assert.ok(!empty.stderr.includes("/101/seasons") && !empty.stderr.includes("/101/episodes"));
    assert.deepEqual(json(empty).episodeCatalogs, []);
    const emptySeasons = cli("run", TVMAZE, "getTvDetail", "101", "--fixtures", fixture, "--check", "--scope", '{"seasons":[{"seasonNumber":1,"episodeNumbers":[]},{"seasonNumber":2,"episodeNumbers":[]}]}');
    assert.equal(emptySeasons.status, 0, emptySeasons.stderr);
    assert.deepEqual(json(emptySeasons).seasons, []);
    assert.deepEqual(json(emptySeasons).episodes, []);
    assert.deepEqual(json(emptySeasons).episodeCatalogs.map((catalog) => catalog.episodes.length), [3, 2]);
    for (const images of [false, true]) {
        const actor = cli("run", TVMAZE, "getActorDetail", "201", "--fixtures", fixture, "--check", "--config", JSON.stringify({ includeImages: images }));
        assert.equal(actor.status, 0, actor.stderr);
        assert.equal(Boolean(json(actor).avatar), images);
    }
});

test("cast and crew stay linked to the adapted plugin's actor capability", (t) => {
    const result = cli("run", TVMAZE, "getTvDetail", "101", "--fixtures", enrichedFixture(t), "--check", "--scope", '{"seasons":[]}', "--config", '{"includeCrew":true}');
    assert.equal(result.status, 0, result.stderr);
    for (const credit of [...json(result).cast, ...json(result).crew]) assert.equal(credit.scraperPluginId, manifest.id);
});

test("nonboolean option values fail before network access", () => {
    for (const key of ["includeImages", "includeCast", "includeCrew", "includeAliases"]) {
        const result = run("test", "--expect-error", "--config", JSON.stringify({ [key]: "yes" }));
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /expected boolean/);
        assert.ok(!result.stderr.includes("GET https:"));
    }
});

test("all declared methods distinguish HTTP, malformed data and network failures", (t) => {
    const fixture = path.join(tempDir(t), "errors.json");
    for (const response of [
        { status: 401, text: "Unauthorized" },
        { status: 403, text: "Forbidden" },
        { status: 404, text: "Not Found" },
        { status: 429, text: "Too Many Requests" },
        { text: "<html>maintenance</html>" },
        { json: {} },
        { networkError: true }
    ]) {
        fs.writeFileSync(fixture, JSON.stringify({ requests: [{ url: "https://api.tvmaze.com/", match: "prefix", ...response }] }));
        for (const args of [["test"], ["searchTv", "Demo Show"], ["searchActors", "Demo Actor"], ["getTvDetail", "101"], ["getActorDetail", "201"]]) {
            const result = cli("run", TVMAZE, ...args, "--fixtures", fixture, "--expect-error");
            assert.equal(result.status, 0, result.stderr);
        }
    }
});
