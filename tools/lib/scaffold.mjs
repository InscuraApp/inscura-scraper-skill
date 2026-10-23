// `inscura new`: renders templates/plugin into a plugin directory with config presets
// (see docs/config-patterns.md) and standard scrape-field declarations.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAPABILITIES, STANDARD_FIELD_META } from "./fields.mjs";
import { refreshReadme } from "./pack.mjs";
import { InvalidPlugin, validateManifest } from "./manifest.mjs";

const TEMPLATE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "plugin");
const DEFAULT_FIELDS = { media: ["title"], actor: ["name"], tv: ["title"] };
const CAPABILITY_TEXT = {
    media: "Movies / standalone media (影片): search + detail",
    actor: "People / actors (演员): search + detail",
    tv: "TV shows (电视剧): search + detail, seasons, episodes and episode catalogs",
};

function fail(message) {
    throw new InvalidPlugin(message);
}

export function parseAuth(value) {
    if (!value || value === "none") return { type: "none" };
    if (value === "bearer") return { type: "bearer" };
    const match = /^(header|query):([A-Za-z0-9_.-]+)$/.exec(value);
    if (!match) fail("--auth must be none, bearer, header:<Header-Name> or query:<param>");
    return { type: match[1], name: match[2] };
}

function link(url, label) {
    return url ? '<a href="' + url + '">' + label + "</a>" : label;
}

export function configPresets({ auth, selfHosted, baseUrl, keyUrl, images, timeout }) {
    const config = [];
    if (selfHosted) {
        config.push({
            key: "baseUrl",
            type: "text",
            required: true,
            default: baseUrl ?? "",
            label: { en: "Server URL", "zh-CN": "服务地址" },
            placeholder: { en: "http://localhost:8080", "zh-CN": "http://localhost:8080" },
            help: {
                en: "Address of your own server, including http:// or https:// and any path prefix. Local addresses are allowed.",
                "zh-CN": "你自己部署的服务地址，需包含 http:// 或 https://，以及路径前缀（如有）。可以填写局域网或本机地址。",
            },
        });
    }
    if (auth.type !== "none") {
        const where = auth.type === "query" ? "query parameter " + auth.name : auth.type === "header" ? "header " + auth.name : "Authorization: Bearer header";
        const token = auth.type === "bearer";
        config.push({
            key: "apiKey",
            type: "password",
            required: true,
            default: "",
            label: token ? { en: "Access token", "zh-CN": "访问令牌" } : { en: "API key", "zh-CN": "API 密钥" },
            placeholder: { en: "Paste your " + (token ? "token" : "API key"), "zh-CN": "粘贴你的" + (token ? "访问令牌" : " API 密钥") },
            help: {
                en: "Get one from " + link(keyUrl, keyUrl ? "the provider's account page" : "your account on the data source") +
                    ". Sent as the " + where + ". Kept in Inscura's plugin settings only.",
                "zh-CN": "在" + link(keyUrl, "数据源的账号页面") + "申请。请求时作为 " + where + " 发送，仅保存在 Inscura 的插件设置中。",
            },
        });
    }
    if (images) {
        config.push({
            key: "includeImages",
            type: "boolean",
            required: false,
            default: images === "on",
            label: { en: "Include remote images", "zh-CN": "返回远程图片" },
            help: {
                en: "Return poster, backdrop and photo URLs. Inscura may download them when applying metadata; check the source's image terms.",
                "zh-CN": "返回海报、背景图和照片地址，应用元数据时 Inscura 可能下载这些图片。请先确认数据源的图片使用条款。",
            },
        });
    }
    if (timeout) {
        config.push({
            key: "requestTimeout",
            type: "number",
            required: false,
            default: 30,
            min: 5,
            max: 180,
            label: { en: "Request timeout (seconds)", "zh-CN": "请求超时（秒）" },
            help: { en: "Increase for slow self-hosted servers.", "zh-CN": "自建服务较慢时可调大。" },
        });
    }
    return config;
}

export function parseFieldSpecs(specs, capabilities) {
    const selected = Object.fromEntries(capabilities.map((capability) => [capability, [...DEFAULT_FIELDS[capability]]]));
    for (const spec of specs ?? []) {
        const match = /^(media|actor|tv)=([A-Za-z,]+)$/.exec(spec);
        if (!match) fail("--fields must look like tv=title,description,poster");
        if (!capabilities.includes(match[1])) fail("--fields names undeclared capability " + match[1]);
        for (const id of match[2].split(",").filter(Boolean)) {
            if (!STANDARD_FIELD_META[match[1]][id]) {
                fail("unknown standard field " + match[1] + "." + id + "; run `inscura fields " + match[1] + "` for the allowlist");
            }
            if (!selected[match[1]].includes(id)) selected[match[1]].push(id);
        }
    }
    return selected;
}

function scrapeFields(selected, provider) {
    return Object.fromEntries(Object.entries(selected).map(([capability, ids]) => [capability, ids.map((id) => {
        const meta = STANDARD_FIELD_META[capability][id];
        return { id, key: id, provider, kind: "standard", fieldType: meta.fieldType, label: meta.label, translatable: meta.translatable };
    })]));
}

function render(template, values) {
    return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => {
        if (!(key in values)) throw new Error("template placeholder without value: " + key);
        return values[key];
    });
}

const readTemplate = (...parts) => fs.readFileSync(path.join(TEMPLATE_DIR, ...parts), "utf8");

export function scaffold(dir, options) {
    const id = options.id;
    if (!id) fail("--id is required (lowercase letters, digits and -, e.g. tmdb-movies)");
    if (!options.name) fail("--name is required");
    const capabilities = (options.capabilities ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    if (capabilities.length === 0) fail("--capabilities is required, e.g. media,actor or tv,actor");
    for (const capability of capabilities) if (!CAPABILITIES.includes(capability)) fail("unsupported capability " + capability + "; use media, actor or tv");
    const [providerId, ...labelParts] = (options.provider ?? "").split(":");
    if (!/^[A-Za-z0-9_.-]+$/.test(providerId ?? "")) fail("--provider is required as id:Label, e.g. tmdb:TMDB");
    const providerLabel = labelParts.join(":") || providerId;
    const auth = parseAuth(options.auth);
    const selfHosted = Boolean(options.selfHosted);
    const baseUrl = options.baseUrl ? options.baseUrl.replace(/\/+$/, "") : undefined;
    if (!baseUrl && !selfHosted) fail("--base-url is required unless --self-hosted is set");
    if (baseUrl && !/^https?:\/\/[^\s/?#@]+(\/[^\s?#]*)?$/i.test(baseUrl)) fail("--base-url must look like https://host[/path]");
    if (options.images && !["on", "off"].includes(options.images)) fail("--images must be on or off");
    const homepage = options.homepage ?? (baseUrl && baseUrl.startsWith("https://") ? baseUrl : undefined);
    const version = options.version ?? "1.0.0";

    const target = path.resolve(dir);
    if (fs.existsSync(target) && fs.readdirSync(target).length > 0) fail("target directory is not empty: " + target);

    const manifest = {
        id,
        name: options.name,
        version,
        description: options.description ?? options.name + " metadata for Inscura.",
        ...(options.author ? { author: options.author } : {}),
        ...(homepage ? { homepage } : {}),
        apiVersion: 1,
        entry: "index.js",
        capabilities,
        providers: Object.fromEntries(capabilities.map((capability) => [capability, [{ id: providerId, label: { en: providerLabel } }]])),
        config: configPresets({ auth, selfHosted, baseUrl, keyUrl: options.keyUrl, images: options.images, timeout: options.timeout }),
        scrapeFields: scrapeFields(parseFieldSpecs(options.fields, capabilities), providerId),
    };
    validateManifest(manifest);

    const source = render(readTemplate("index.js"), {
        NAME: options.name.replace(/[\r\n]/g, " "),
        HOMEPAGE: homepage ?? "(fill in)",
        NAME_JSON: JSON.stringify(options.name),
        BASE_URL_JSON: JSON.stringify(baseUrl ?? ""),
        AUTH_JSON: JSON.stringify(auth),
        PROVIDERS_JSON: JSON.stringify(Object.fromEntries(capabilities.map((capability) => [capability, [providerId]]))),
        USER_AGENT_JSON: JSON.stringify("Inscura-" + id + "/" + version),
        CAPABILITY_HELPERS: capabilities.includes("tv") ? readTemplate("helpers", "tv.js") : "",
        METHODS: CAPABILITIES.filter((capability) => capabilities.includes(capability))
            .map((capability) => readTemplate("methods", capability + ".js").replace(/\n$/, "")).join("\n"),
    });
    const readme = render(readTemplate("README.md"), {
        NAME: options.name,
        ID: id,
        VERSION: version,
        DESCRIPTION: manifest.description,
        HOMEPAGE: homepage ?? "(fill in)",
        CAPABILITY_LIST: capabilities.map((capability) => "- " + CAPABILITY_TEXT[capability]).join("\n"),
    });

    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    fs.writeFileSync(path.join(target, "index.js"), source);
    fs.writeFileSync(path.join(target, "README.md"), readme);
    refreshReadme(target, manifest);
    return { target, manifest };
}
