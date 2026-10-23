import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = path.join(ROOT, "tools", "inscura.mjs");
export const TVMAZE = path.join(ROOT, "examples", "tvmaze");
export const TVMAZE_FIXTURES = path.join(ROOT, "test", "fixtures", "tvmaze.json");

export function cli(...args) {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: ROOT });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function tempDir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inscura-test-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

export function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return file;
}
