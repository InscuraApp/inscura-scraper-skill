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
            label: { en: "Server URL", "zh-CN": "服务地址", "zh-TW": "伺服器網址", ja: "サーバー URL", ko: "서버 URL" },
            placeholder: Object.fromEntries(["en", "zh-CN", "zh-TW", "ja", "ko"].map((locale) => [locale, "http://localhost:8080"])),
            help: {
                en: "Address of your own server, including http:// or https:// and any path prefix. Local addresses are allowed.",
                "zh-CN": "你自己部署的服务地址，需包含 http:// 或 https://，以及路径前缀（如有）。可以填写局域网或本机地址。",
                "zh-TW": "自行部署的伺服器網址，需包含 http:// 或 https://，以及路徑前綴（如有）。可使用區域網路或本機位址。",
                ja: "自分で運用するサーバーの URL。http:// または https:// と、必要なパスの接頭辞を含めてください。ローカルアドレスも使用できます。",
                ko: "직접 운영하는 서버 주소입니다. http:// 또는 https://와 필요한 경로 접두사를 포함하세요. 로컬 주소도 사용할 수 있습니다.",
            },
        });
    }
    if (auth.type !== "none") {
        const where = auth.type === "query" ? "query parameter " + auth.name : auth.type === "header" ? "header " + auth.name : "Authorization: Bearer header";
        const authLocation = {
            "zh-TW": auth.type === "query" ? "查詢參數 " + auth.name : auth.type === "header" ? "標頭 " + auth.name : "Authorization: Bearer 標頭",
            ja: auth.type === "query" ? "クエリパラメーター " + auth.name : auth.type === "header" ? "ヘッダー " + auth.name : "Authorization: Bearer ヘッダー",
            ko: auth.type === "query" ? "쿼리 매개변수 " + auth.name : auth.type === "header" ? "헤더 " + auth.name : "Authorization: Bearer 헤더",
        };
        const token = auth.type === "bearer";
        config.push({
            key: "apiKey",
            type: "password",
            required: true,
            default: "",
            label: token
                ? { en: "Access token", "zh-CN": "访问令牌", "zh-TW": "存取權杖", ja: "アクセストークン", ko: "액세스 토큰" }
                : { en: "API key", "zh-CN": "API 密钥", "zh-TW": "API 金鑰", ja: "API キー", ko: "API 키" },
            placeholder: {
                en: "Paste your " + (token ? "token" : "API key"),
                "zh-CN": "粘贴你的" + (token ? "访问令牌" : " API 密钥"),
                "zh-TW": "貼上你的" + (token ? "存取權杖" : " API 金鑰"),
                ja: (token ? "トークン" : "API キー") + "を貼り付け",
                ko: (token ? "토큰" : "API 키") + " 붙여넣기",
            },
            help: {
                en: "Get one from " + link(keyUrl, keyUrl ? "the provider's account page" : "your account on the data source") +
                    ". Sent as the " + where + ". Kept in Inscura's plugin settings only.",
                "zh-CN": "在" + link(keyUrl, "数据源的账号页面") + "申请。请求时作为 " + where + " 发送，仅保存在 Inscura 的插件设置中。",
                "zh-TW": "在" + link(keyUrl, "資料來源的帳戶頁面") + "申請。請求時以" + authLocation["zh-TW"] + "傳送，僅儲存在 Inscura 的外掛程式設定中。",
                ja: link(keyUrl, "データ提供元のアカウントページ") + "で取得してください。" + authLocation.ja + "として送信され、Inscura のプラグイン設定にのみ保存されます。",
                ko: link(keyUrl, "데이터 제공업체의 계정 페이지") + "에서 발급받으세요. " + authLocation.ko + "로 전송되며 Inscura 플러그인 설정에만 저장됩니다.",
            },
        });
    }
    if (images) {
        config.push({
            key: "includeImages",
            type: "boolean",
            required: false,
            default: images === "on",
            label: { en: "Include remote images", "zh-CN": "返回远程图片", "zh-TW": "傳回遠端圖片", ja: "リモート画像を含める", ko: "원격 이미지 포함" },
            help: {
                en: "Return available poster, backdrop and photo URLs. Images are core assets; the recommended default is enabled. Source image terms still apply.",
                "zh-CN": "返回可用的海报、背景图和照片地址。图片是核心资产，推荐默认开启。仍须遵守来源图片使用条款。",
                "zh-TW": "傳回可用的海報、背景圖和照片網址。圖片是核心資產，建議預設開啟。仍須遵守來源圖片使用條款。",
                ja: "利用可能なポスター、背景画像、写真の URL を返します。画像は重要な資産のため既定での有効化を推奨します。提供元の画像利用条件が適用されます。",
                ko: "사용 가능한 포스터, 배경 및 사진 URL을 반환합니다. 이미지는 핵심 자산이므로 기본 활성화를 권장합니다. 출처의 이미지 이용 약관이 적용됩니다.",
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
            label: { en: "Request timeout (seconds)", "zh-CN": "请求超时（秒）", "zh-TW": "請求逾時（秒）", ja: "リクエストのタイムアウト（秒）", ko: "요청 제한 시간(초)" },
            help: {
                en: "Increase for slow self-hosted servers.", "zh-CN": "自建服务较慢时可调大。",
                "zh-TW": "自架伺服器較慢時可調高。", ja: "自分で運用するサーバーが遅い場合は値を大きくしてください。", ko: "직접 운영하는 서버가 느리면 값을 늘리세요.",
            },
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
        providers: Object.fromEntries(capabilities.map((capability) => [capability, [{
            id: providerId,
            label: Object.fromEntries(["en", "zh-CN", "zh-TW", "ja", "ko"].map((locale) => [locale, providerLabel])),
        }]])),
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
