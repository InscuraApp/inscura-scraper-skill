#!/usr/bin/env node
// Verify an actual test -> search -> selected-candidate detail chain, without
// printing source metadata, request URLs, config values or plugin log messages.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { METHODS } from "./lib/fields.mjs";
import { parseStrictJson } from "./lib/json.mjs";
import { validatePlugin } from "./lib/manifest.mjs";
import { checkResult, checkTestResult, checkTvScope } from "./lib/results.mjs";
import { configDefaults, findUnserializable, invoke, loadPlugin, redactor } from "./lib/sandbox.mjs";

const USAGE = "Usage: node tools/smoke.mjs <plugin-dir> <media|actor|tv> <query> (--fixtures <file> | --live) [--provider <id>] [--config <json|@file>] [--scope <json|@file>]";
const evidence = { result: "failed", stage: "arguments" };
let secrets = [];

class SmokeFailure extends Error {}
const fail = (code) => { throw new SmokeFailure(code); };
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function jsonArgument(value) {
    return value === undefined ? undefined : parseStrictJson(value.startsWith("@") ? fs.readFileSync(value.slice(1), "utf8") : value, "argument");
}

function safeEvidence(value) {
    if (typeof value === "string") return redactor(secrets)(value);
    if (Array.isArray(value)) return value.map(safeEvidence);
    if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeEvidence(item)]));
    return value;
}

async function main() {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: {
        fixtures: { type: "string" }, live: { type: "boolean" }, provider: { type: "string" },
        config: { type: "string" }, scope: { type: "string" }, help: { type: "boolean" },
    } });
    if (values.help) { process.stdout.write(USAGE + "\n"); return; }
    const [directory, capability, query] = positionals;
    if (positionals.length !== 3 || !directory.trim() || !Object.hasOwn(METHODS, capability) || !query.trim()) fail("invalid_arguments");
    if (Number(values.fixtures !== undefined) + Number(Boolean(values.live)) !== 1) fail("choose_fixtures_or_live");
    if (values.provider !== undefined && !values.provider.trim()) fail("invalid_provider");
    if (values.scope !== undefined && capability !== "tv") fail("scope_requires_tv");
    const config = jsonArgument(values.config) ?? {};
    if (!isObject(config)) fail("invalid_config");
    const tvScope = jsonArgument(values.scope);
    if (tvScope !== undefined && (!isObject(tvScope) || !Array.isArray(tvScope.seasons) || tvScope.seasons.some((season) =>
        !isObject(season) || !Number.isInteger(season.seasonNumber) || season.seasonNumber < 0 || !Array.isArray(season.episodeNumbers) ||
        season.episodeNumbers.some((episode) => !Number.isInteger(episode) || episode < 0)))) fail("invalid_scope");

    evidence.stage = "validate";
    const pluginDir = path.resolve(directory);
    const validated = validatePlugin(pluginDir);
    const { manifest, source, entry } = validated;
    const mergedConfig = { ...configDefaults(manifest), ...config };
    secrets = (manifest.config ?? []).filter((field) => field.type === "password")
        .map((field) => mergedConfig[field.key]).filter((value) => typeof value === "string" && value.length > 0);
    if (!manifest.capabilities.includes(capability)) fail("undeclared_capability");
    const providers = manifest.providers[capability].map((item) => item.id);
    const searchProvider = values.provider ?? providers[0];
    if (!providers.includes(searchProvider)) fail("undeclared_provider");
    evidence.plugin = { path: pluginDir, id: manifest.id, version: manifest.version, entry };
    evidence.capability = capability;
    evidence.mode = values.live ? "live" : "fixtures";
    evidence.searchProvider = searchProvider;
    evidence.methods = [];
    const [searchMethod, detailMethod] = METHODS[capability];

    async function run(method, input, provider) {
        evidence.stage = method;
        const outcome = await invoke({ plugin: loadPlugin(source, entry), manifest, method, input, provider, config, tvScope,
            fetchMode: evidence.mode, fixtures: values.fixtures, log() {} });
        if (outcome.http.unmatched.length) fail("unmatched_fixture");
        if (!outcome.ok) fail("method_failed");
        if (findUnserializable(outcome.value)) fail("non_json_result");
        const serialized = JSON.stringify(outcome.value ?? null);
        if (secrets.some((secret) => serialized.includes(secret) || serialized.includes(encodeURIComponent(secret)))) fail("secret_in_result");
        const result = JSON.parse(serialized);
        try {
            if (method === "test") checkTestResult(result);
            else checkResult(capability, outcome.operation, result, provider, outcome.operation === "search" ? providers : undefined);
            if (method === detailMethod && capability === "tv" && tvScope !== undefined) checkTvScope(result, tvScope);
        } catch { fail("invalid_result"); }
        if (method === "test" && result.ok !== true) fail("connection_test_failed");
        if (method === detailMethod && result.id !== input) fail("detail_identity_mismatch");
        evidence.methods.push(method);
        return result;
    }

    await run("test");
    const candidates = await run(searchMethod, query, searchProvider);
    if (!candidates.length) fail("empty_search");
    const selected = candidates[0];
    evidence.candidate = { id: selected.id, provider: selected.provider };
    // Always follow the returned concrete provider, including aggregate searches.
    await run(detailMethod, selected.id, selected.provider);
    evidence.result = "passed";
    delete evidence.stage;
    process.stdout.write(JSON.stringify(safeEvidence(evidence)) + "\n");
}

main().catch((error) => {
    evidence.error = error instanceof SmokeFailure ? error.message : "validation_or_execution_failed";
    process.stdout.write(JSON.stringify(safeEvidence(evidence)) + "\n");
    process.exitCode = 1;
});
