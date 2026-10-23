import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { readZip } from "../tools/lib/zip.mjs";
import { cli, tempDir, writeJson } from "./helpers.mjs";

const BASE = "https://api.example.com/v1";

function finishStubs(dir) {
    const file = path.join(dir, "index.js");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^.*TODO\(inscura\).*\n/gm, ""));
}

test("media + actor plugin with a query API key: scaffold, run, pack", (t) => {
    const work = tempDir(t);
    const plugin = path.join(work, "demo-movies");
    const created = cli("new", plugin, "--id", "demo-movies", "--name", "Demo Movies", "--capabilities", "media,actor",
        "--provider", "demo:Demo", "--base-url", BASE, "--auth", "query:api_key", "--key-url", "https://example.com/keys",
        "--images", "on", "--fields", "media=description,releaseDate,rating", "--fields", "actor=avatar");
    assert.equal(created.status, 0, created.stderr);

    const manifest = JSON.parse(fs.readFileSync(path.join(plugin, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.config.map((field) => [field.key, field.type, field.default]), [["apiKey", "password", ""], ["includeImages", "boolean", true]]);
    assert.deepEqual(manifest.scrapeFields.media.map((field) => field.id), ["title", "description", "releaseDate", "rating"]);
    assert.equal(manifest.scrapeFields.media.find((field) => field.id === "rating").translatable, false);
    assert.match(fs.readFileSync(path.join(plugin, "README.md"), "utf8"), /\| API key \/ API 密钥 \| `apiKey` \| password \| yes \|/);

    const validated = cli("validate", plugin);
    assert.equal(validated.status, 0, validated.stderr);
    assert.match(validated.stdout, /TODO\(inscura\)/);
    const refused = cli("pack", plugin, path.join(work, "early.zip"));
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /TODO\(inscura\)/);

    finishStubs(plugin);
    const fixtures = writeJson(path.join(plugin, "fixtures", "api.json"), { requests: [
        { url: BASE + "/?api_key=***", json: {} },
        { url: BASE + "/search?q=Alien&api_key=***", json: [{ id: 7, title: "Alien" }, { id: 8 }] },
        { url: BASE + "/items/7?api_key=***", json: { id: 7, title: "Alien" } },
        { url: BASE + "/items/0?api_key=***", status: 401, json: { message: "bad key" } },
        { url: BASE + "/people/search?q=Ann&api_key=***", json: [{ id: "a1", name: "Ann", image: "https://img.example.com/a.jpg" }] },
        { url: BASE + "/people/a1?api_key=***", json: { id: "a1", name: "Ann" } },
    ] });
    const secrets = writeJson(path.join(work, "secrets.json"), { apiKey: "sk-test-secret-value" });
    const run = (...args) => cli("run", plugin, ...args, "--fixtures", fixtures, "--config", "@" + secrets);

    for (const args of [["test"], ["searchMedia", "Alien"], ["getMediaDetail", "7"], ["searchActors", "Ann"], ["getActorDetail", "a1"]]) {
        const result = run(...args, "--check");
        assert.equal(result.status, 0, args.join(" ") + "\n" + result.stderr);
        assert.doesNotMatch(result.stdout + result.stderr, /sk-test-secret-value/);
    }
    assert.deepEqual(JSON.parse(run("searchMedia", "Alien").stdout), [{ id: "7", provider: "demo", title: "Alien" }]);
    assert.equal(JSON.parse(run("searchActors", "Ann").stdout)[0].avatar, "https://img.example.com/a.jpg");
    const imagesOff = cli("run", plugin, "searchActors", "Ann", "--fixtures", fixtures, "--config", '{"apiKey":"sk-test-secret-value","includeImages":false}');
    assert.equal(JSON.parse(imagesOff.stdout)[0].avatar, undefined);

    const unauthorized = run("getMediaDetail", "0", "--expect-error");
    assert.equal(unauthorized.status, 0, unauthorized.stderr);
    assert.match(unauthorized.stdout, /authentication failed \(HTTP 401\)/);
    const missingKey = cli("run", plugin, "searchMedia", "Alien", "--fixtures", fixtures, "--expect-error");
    assert.equal(missingKey.status, 0, missingKey.stderr);
    assert.match(missingKey.stdout, /API key is not configured/);

    const packed = cli("pack", plugin);
    assert.equal(packed.status, 0, packed.stderr);
    const zip = path.join(work, "demo-movies-v1.0.0.zip");
    const files = readZip(fs.readFileSync(zip));
    assert.deepEqual([...files.keys()], ["README.md", "index.js", "manifest.json"]);
    assert.match(packed.stdout, /sha256: [0-9a-f]{64}/);
});

test("self-hosted TV plugin gets a server URL setting and scope helpers", (t) => {
    const work = tempDir(t);
    const plugin = path.join(work, "home");
    const created = cli("new", plugin, "--id", "home-tv", "--name", "Home TV", "--capabilities", "tv",
        "--provider", "home:Home", "--self-hosted", "--base-url", "http://localhost:8080", "--auth", "bearer", "--timeout", "--images", "off");
    assert.equal(created.status, 0, created.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(plugin, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.config.map((field) => field.key), ["baseUrl", "apiKey", "includeImages", "requestTimeout"]);
    assert.equal(manifest.config[0].default, "http://localhost:8080");
    assert.match(fs.readFileSync(path.join(plugin, "index.js"), "utf8"), /function episodeRequested/);
    finishStubs(plugin);
    const fixtures = writeJson(path.join(work, "fx.json"), { requests: [
        { url: "http://media.lan:9000/api/search/tv?q=Show", json: [{ id: 5, title: "Show" }] },
    ] });
    const result = cli("run", plugin, "searchTv", "Show", "--fixtures", fixtures, "--check",
        "--config", '{"baseUrl":"http://media.lan:9000/api/","apiKey":"tok-12345"}');
    assert.equal(result.status, 0, result.stderr);
    const badUrl = cli("run", plugin, "searchTv", "Show", "--fixtures", fixtures, "--expect-error",
        "--config", '{"baseUrl":"http://user:pw@media.lan","apiKey":"tok-12345"}');
    assert.equal(badUrl.status, 0, badUrl.stderr);
    assert.match(badUrl.stdout, /server URL must look like/);
});

test("scaffold rejects bad input", (t) => {
    const work = tempDir(t);
    const base = ["--id", "x", "--name", "X", "--provider", "x:X", "--base-url", BASE];
    assert.match(cli("new", path.join(work, "a"), ...base, "--capabilities", "game").stderr, /unsupported capability game/);
    assert.match(cli("new", path.join(work, "b"), ...base, "--capabilities", "tv", "--fields", "tv=runtime").stderr, /unknown standard field tv\.runtime/);
    assert.match(cli("new", path.join(work, "c"), ...base, "--capabilities", "tv", "--auth", "cookie").stderr, /--auth must be/);
    assert.match(cli("new", path.join(work, "d"), "--id", "x", "--name", "X", "--provider", "x:X", "--capabilities", "tv").stderr, /--base-url is required/);
});
