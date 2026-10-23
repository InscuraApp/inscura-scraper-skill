import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readZip } from "../tools/lib/zip.mjs";
import { TVMAZE, TVMAZE_FIXTURES, cli, tempDir } from "./helpers.mjs";

const run = (...args) => cli("run", TVMAZE, ...args, "--fixtures", TVMAZE_FIXTURES);
const json = (result) => JSON.parse(result.stdout);

test("example validates", () => {
    const result = cli("validate", TVMAZE);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS tvmaze-example@1\.0\.0/);
});

test("test(ctx) succeeds", () => {
    const result = run("test", "--check");
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(json(result), { ok: true });
});

test("searchTv maps candidates and keeps images off by default", () => {
    const result = run("searchTv", "Demo Show", "--check");
    assert.equal(result.status, 0, result.stderr);
    const [first, second] = json(result);
    assert.equal(first.id, "101");
    assert.equal(first.overview, "A synthetic show & nothing more.");
    assert.equal(first.network, "Demo Network");
    assert.deepEqual(first.externalIds, [{ provider: "imdb", id: "tt0000101" }, { provider: "tvdb", id: "5101" }]);
    assert.equal(first.posterUrl, undefined);
    assert.equal(second.year, undefined);
});

test("includeImages=true returns poster URLs", () => {
    const result = run("searchTv", "Demo Show", "--check", "--config", '{"includeImages":true}');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(json(result)[0].posterUrl, "https://static.example.invalid/o.jpg");
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
    assert.deepEqual(json(search), [{ id: "201", provider: "tvmaze", name: "Demo Actor" }]);
    const detail = run("getActorDetail", "201", "--check");
    assert.equal(detail.status, 0, detail.stderr);
    assert.equal(json(detail).birthday, "1970-01-02");
    assert.equal(json(detail).nationality, undefined);
});

test("a request without a fixture fails even with --expect-error", () => {
    const result = run("getTvDetail", "12345", "--expect-error");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /requests without a fixture/);
});

test("pack produces a reproducible allowlisted ZIP and refuses to overwrite", (t) => {
    const dir = tempDir(t);
    const first = cli("pack", TVMAZE, path.join(dir, "a.zip"));
    assert.equal(first.status, 0, first.stderr);
    const second = cli("pack", TVMAZE, path.join(dir, "b.zip"));
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(fs.readFileSync(path.join(dir, "a.zip")), fs.readFileSync(path.join(dir, "b.zip")));
    const files = readZip(fs.readFileSync(path.join(dir, "a.zip")));
    assert.deepEqual([...files.keys()], ["ATTRIBUTION.md", "LICENSE", "README.md", "index.js", "manifest.json"]);
    assert.equal(files.get("index.js").toString(), fs.readFileSync(path.join(TVMAZE, "index.js"), "utf8"));
    const again = cli("pack", TVMAZE, path.join(dir, "a.zip"));
    assert.equal(again.status, 1);
    assert.match(again.stderr, /refusing to overwrite/);
});
