import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = path.join(ROOT, "tools", "inscura.mjs");
export function pluginDirectory(variable) {
    const configured = process.env[variable];
    if (configured === undefined || !configured.trim()) throw new Error(`${variable} must be a non-empty plugin directory`);
    return path.resolve(configured);
}

export const TVMAZE_FIXTURES = path.join(ROOT, "checks", "fixtures", "tvmaze.json");

export function cli(...args) {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", cwd: ROOT });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function tempDir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inscura-check-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

export function writeJson(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
    return file;
}
