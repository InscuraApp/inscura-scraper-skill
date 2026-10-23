import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseStrictJson } from "../tools/lib/json.mjs";
import { validateManifest } from "../tools/lib/manifest.mjs";
import { checkResult, checkTvScope } from "../tools/lib/results.mjs";
import { findUnserializable, loadPlugin } from "../tools/lib/sandbox.mjs";
import { createZip, readZip } from "../tools/lib/zip.mjs";
import { TVMAZE, cli, tempDir, writeJson } from "./helpers.mjs";

const manifest = () => JSON.parse(fs.readFileSync(path.join(TVMAZE, "manifest.json"), "utf8"));

test("strict JSON rejects duplicate keys and non-finite numbers", () => {
    assert.throws(() => parseStrictJson('{"a":1,"a":2}'), /duplicate JSON key "a"/);
    assert.throws(() => parseStrictJson('{"a":1e999}'), /non-finite/);
    assert.throws(() => parseStrictJson('{"a":NaN}'), /invalid number/);
    assert.deepEqual(parseStrictJson('{"__proto__":{"x":1},"b":[true,null,"\\u00e9"]}'), JSON.parse('{"__proto__":{"x":1},"b":[true,null,"\\u00e9"]}'));
});

test("manifest rules", () => {
    assert.doesNotThrow(() => validateManifest(manifest()));
    const cases = [
        [(m) => m.capabilities.push("game"), /does not support game/],
        [(m) => m.config.push({ key: "language", type: "text", label: { en: "Lang" } }), /injected by the host/],
        [(m) => m.config.push({ key: "k", type: "password", label: { en: "K" }, default: "x" }), /never distribute/],
        [(m) => { m.entry = null; }, /path must be a nonempty string/],
        [(m) => { m.scrapeFields.tv[0].id = "runtime"; m.scrapeFields.tv[0].key = "runtime"; }, /unsupported standard field/],
        [(m) => { m.id = "inscura-scraper"; }, /reserved/],
    ];
    for (const [mutate, message] of cases) {
        const value = manifest();
        mutate(value);
        assert.throws(() => validateManifest(value), message);
    }
});

test("result rules catch common mapping mistakes", () => {
    assert.throws(() => checkResult("media", "detail", { id: "1", provider: "p", description: "x" }), /unknown fields: description/);
    assert.throws(() => checkResult("actor", "detail", { id: "1", provider: "p", name: "N", height: 175 }), /expected string/);
    assert.throws(() => checkResult("tv", "search", [{ id: "1", provider: "q", title: "T" }], "p"), /does not match expected provider/);
    assert.throws(() => checkResult("tv", "detail", { id: "1", provider: "p", firstAired: "2021-02-30" }), /invalid calendar date/);
    assert.doesNotThrow(() => checkResult("media", "detail", { id: "1", provider: "p", summary: "x", score: 7.5, releaseDate: "1999-03" }));
});

test("TV scope check flags out-of-scope data", () => {
    const scope = { seasons: [{ seasonNumber: 1, episodeNumbers: [1] }, { seasonNumber: 2, episodeNumbers: [] }] };
    assert.doesNotThrow(() => checkTvScope({ seasons: [{ seasonNumber: 1 }], episodes: [{ seasonNumber: 1, episodeNumber: 1 }],
        episodeCatalogs: [{ seasonNumber: 1, episodes: [] }, { seasonNumber: 2, episodes: [] }] }, scope));
    assert.throws(() => checkTvScope({ seasons: [{ seasonNumber: 2 }] }, scope), /no local episodes/);
    assert.throws(() => checkTvScope({ episodes: [{ seasonNumber: 1, episodeNumber: 2 }] }, scope), /S1E2 is outside tvScope/);
    assert.throws(() => checkTvScope({ episodeCatalogs: [{ seasonNumber: 3, episodes: [] }] }, scope), /catalog is outside/);
    assert.throws(() => checkTvScope({ episodeCatalogs: [{ seasonNumber: 1, episodes: [] }, { seasonNumber: 1, episodes: [] }] }, scope), /duplicate catalog/);
});

test("sandbox lacks host-missing globals and supports export forms", () => {
    const probe = loadPlugin("module.exports = { test: function () { return [typeof setTimeout, typeof URL, typeof console, typeof Intl, typeof require, typeof JSON]; } };");
    assert.deepEqual([...probe.exports.test()], ["undefined", "undefined", "undefined", "undefined", "undefined", "object"]);
    const viaDefault = loadPlugin("module.exports.default = { searchTv: async function () { return []; } };");
    assert.equal(typeof viaDefault.exports.searchTv, "function");
    assert.throws(() => loadPlugin("new URL('https://x');"), /top-level code failed.*URL is not defined/);
});

test("non-JSON results are detected", () => {
    assert.match(findUnserializable({ a: [1, Number.NaN] }), /\$\.a\[1\]: non-finite/);
    assert.match(findUnserializable({ when: new Date(0) }), /Date object/);
    assert.match(findUnserializable([undefined]), /undefined inside an array/);
    assert.equal(findUnserializable({ omitted: undefined, ok: [1, "x", null, { y: true }] }), null);
});

test("zip round trip", () => {
    const entries = new Map([["b.txt", Buffer.from("bravo")], ["a.txt", Buffer.from("alpha ".repeat(100))]]);
    const files = readZip(createZip(entries));
    assert.deepEqual([...files.keys()], ["a.txt", "b.txt"]);
    assert.equal(files.get("a.txt").toString(), "alpha ".repeat(100));
});

test("run reports leaked secrets and Date results", (t) => {
    const dir = tempDir(t);
    const plugin = path.join(dir, "leaky");
    writeJson(path.join(plugin, "manifest.json"), { id: "leaky", name: "Leaky", version: "1.0.0", apiVersion: 1, capabilities: ["actor"],
        providers: { actor: [{ id: "p", label: { en: "P" } }] },
        config: [{ key: "apiKey", type: "password", label: { en: "Key" }, default: "" }] });
    fs.writeFileSync(path.join(plugin, "index.js"), [
        "module.exports = {",
        "  searchActors: async function (name, ctx) { return [{ id: '1', provider: 'p', name: ctx.config.apiKey }]; },",
        "  getActorDetail: async function (provider, id, ctx) { return { id: id, provider: provider, name: 'N', birthday: new Date(0) }; }",
        "};",
    ].join("\n"));
    const fixtures = writeJson(path.join(dir, "fx.json"), []);
    const leak = cli("run", plugin, "searchActors", "x", "--fixtures", fixtures, "--config", '{"apiKey":"super-secret-key"}');
    assert.equal(leak.status, 1);
    assert.match(leak.stderr, /result contains a configured secret/);
    assert.doesNotMatch(leak.stdout, /super-secret-key/);
    const date = cli("run", plugin, "getActorDetail", "1", "--fixtures", fixtures);
    assert.equal(date.status, 1);
    assert.match(date.stderr, /Date object/);
});
