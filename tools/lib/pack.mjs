import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { InvalidPlugin, validatePlugin } from "./manifest.mjs";
import { createZip } from "./zip.mjs";

export const CONFIG_START = "<!-- inscura:config:start -->";
export const CONFIG_END = "<!-- inscura:config:end -->";

function localizedText(value) {
    if (!value) return "";
    const en = value.en;
    const zh = value["zh-CN"];
    if (en && zh && en !== zh) return en + " / " + zh;
    return en || zh || Object.values(value)[0] || "";
}

function helpMarkdown(value) {
    return localizedText(value)
        .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
        .replace(/<[^>]+>/g, "")
        .replace(/\|/g, "\\|")
        .replace(/\s+/g, " ")
        .trim();
}

function defaultText(field) {
    if (field.type === "password") return "(empty)";
    if (field.default === undefined || field.default === null) return "";
    if (field.default === "") return "(empty)";
    const option = (field.options ?? []).find((item) => item.value === field.default);
    return "`" + JSON.stringify(field.default) + "`" + (option ? " (" + localizedText(option.label) + ")" : "");
}

export function renderConfigTable(manifest) {
    const config = manifest.config ?? [];
    if (config.length === 0) return "This plugin has no settings. / 此插件无需配置。";
    const rows = config.map((field) => [
        localizedText(field.label),
        "`" + field.key + "`",
        field.type,
        field.required ? "yes" : "no",
        defaultText(field),
        helpMarkdown(field.help),
    ]);
    return [
        "| Setting / 设置项 | Key | Type | Required | Default | Notes |",
        "| --- | --- | --- | --- | --- | --- |",
        ...rows.map((row) => "| " + row.join(" | ") + " |"),
        "",
        "The scraping language is injected by Inscura as `ctx.config.language`; it is not a plugin setting.",
    ].join("\n");
}

// Rewrites the block between the config markers; returns false when the README has no markers.
export function refreshReadme(root, manifest) {
    const file = path.join(root, "README.md");
    if (!fs.existsSync(file)) return false;
    const source = fs.readFileSync(file, "utf8");
    const start = source.indexOf(CONFIG_START);
    const end = source.indexOf(CONFIG_END);
    if (start < 0 || end < start) return false;
    const updated = source.slice(0, start + CONFIG_START.length) + "\n" + renderConfigTable(manifest) + "\n" + source.slice(end);
    if (updated !== source) fs.writeFileSync(file, updated);
    return true;
}

export function packPlugin(root, output, { allowTodo = false } = {}) {
    let result = validatePlugin(root);
    const readmeUpdated = refreshReadme(root, result.manifest);
    if (readmeUpdated) result = validatePlugin(root);
    if (!allowTodo && /TODO\(inscura\)/.test(result.source)) {
        throw new InvalidPlugin("index.js still contains TODO(inscura) scaffold markers; implement or remove them before packaging");
    }
    output = output ?? path.join(path.dirname(path.resolve(root)), result.manifest.id + "-v" + result.manifest.version + ".zip");
    const resolvedOutput = path.resolve(output);
    const resolvedRoot = path.resolve(root);
    if (!resolvedOutput.toLowerCase().endsWith(".zip")) throw new InvalidPlugin("output filename must end in .zip");
    if (!fs.existsSync(path.dirname(resolvedOutput))) throw new InvalidPlugin("output parent directory must already exist: " + path.dirname(resolvedOutput));
    if (resolvedOutput === resolvedRoot || resolvedOutput.startsWith(resolvedRoot + path.sep)) {
        throw new InvalidPlugin("write the ZIP outside the plugin source directory");
    }
    const archive = createZip(result.payload);
    try {
        fs.writeFileSync(resolvedOutput, archive, { flag: "wx" });
    } catch (error) {
        if (error.code === "EEXIST") throw new InvalidPlugin("refusing to overwrite existing file: " + resolvedOutput + "; bump the version or choose a new path");
        throw error;
    }
    return {
        ...result,
        output: resolvedOutput,
        sha256: crypto.createHash("sha256").update(archive).digest("hex"),
        size: archive.length,
        readmeUpdated,
    };
}
