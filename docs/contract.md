# Inscura Scraper Plugin Contract (apiVersion 1)

This reference is self-contained and does not require the Inscura source code. It describes the host implementation as of 2026-10-16. Supported capabilities are `media` (movies and other standalone media), `actor`, and `tv`. Do not generate `game`, `searchGames`, or other unsupported capabilities. See [result-types.md](result-types.md) for return types and [config-patterns.md](config-patterns.md) for settings.

`node tools/inscura.mjs validate` enforces the manifest, package and export rules below; `run --check` enforces the result rules. Rules about semantics (units, scope, error handling) still need review.

## Package and Manifest

Deliver a ZIP file. Prefer placing `manifest.json`, `index.js`, `README.md`, and attribution or license files directly at the ZIP root. One enclosing directory is also accepted; do not nest them two levels deep or include a second manifest. The filename must be exactly lowercase `manifest.json`.

Use safe relative paths and `/` for the entry point and ZIP entries. Do not use absolute paths, `..`, backslashes, colons, NUL characters, or path segments ending in a dot or space. Exclude symbolic links, secrets, account configuration, dependency directories, and user media. `index.js` must be a directly executable, self-contained script that does not require installing npm packages.

Minimal manifest:

```json
{
  "id": "example-scraper",
  "name": "Example Scraper",
  "version": "1.0.0",
  "apiVersion": 1,
  "entry": "index.js",
  "capabilities": ["tv"],
  "providers": {
    "tv": [{ "id": "example", "label": { "en": "Example" } }]
  },
  "config": [],
  "scrapeFields": { "tv": [] }
}
```

| Property | Contract |
| --- | --- |
| `id` | Required, nonempty string containing only ASCII letters, digits, `-`, or `_`. Prefer lowercase names with hyphens. `inscura-scraper` is reserved by the host, case-insensitively, and must not be used. |
| `name`, `version` | Required strings. Use a readable name and semantic version. |
| `apiVersion` | Must be the number `1`. |
| `entry` | String; defaults to `index.js` when omitted. Must identify a file included in the package. |
| `capabilities` | Nonempty array. Declare only capabilities whose method pairs are implemented. |
| `providers` | Required object with optional `media`, `actor`, and `tv` arrays. Each declared capability must have a nonempty array. Every provider requires a nonempty `id` and a locale-keyed `label` object. |
| `description`, `author`, `homepage` | Optional strings. |
| `config` | Optional configuration definition array; defaults to `[]`. |
| `scrapeFields` | Optional object containing field description arrays for the corresponding capabilities. Explicitly list fields the plugin can provide so users can control field selection and translation. |
| `updateUrl` | Optional string. Omit it unless a real update service has been verified; do not provide a placeholder URL. |

A provider identifies a data source; it is distinct from the plugin ID and an entity ID. The host checks provider IDs case-sensitively. A search result must use a provider declared for that capability; an aggregate search may return its declared concrete providers. The detail argument, detail result and field declarations must identify the same concrete provider. Use the host's provider selector; an aggregator can additionally offer filters that apply only to its aggregate selection, as described in [config-patterns.md](config-patterns.md#aggregated-providers). Entity `id` values must always be strings, even when the upstream API uses numbers. Actor search also returns the original ID: **do not concatenate `provider::id` yourself**.

## Methods and Runtime

```js
module.exports = {
  async test(ctx) { return { ok: true }; },
  async searchTv(keyword, ctx) { return []; },
  async getTvDetail(provider, id, ctx) { /* Return a detail object. */ }
};
```

| Capability | Required methods | Return values |
| --- | --- | --- |
| `media` | `searchMedia(keyword, ctx)` / `getMediaDetail(provider, id, ctx)` | Media search result array / media detail object |
| `actor` | `searchActors(name, ctx)` / `getActorDetail(provider, id, ctx)` | Actor search result array / actor detail object |
| `tv` | `searchTv(keyword, ctx)` / `getTvDetail(provider, id, ctx)` | TV search result array / TV detail object |

All methods may be asynchronous. Return `[]` for a successful search with no matches. Throw an `Error` for failures rather than reporting a failed search as a successful empty result. Detail methods must not return `null`, `undefined`, or arrays. Although the host allows `test(ctx)` to be omitted, generated plugins should implement a lightweight, real connectivity check. Return `{ ok: true }` on success; throw an error or return `{ ok: false, error: "Brief diagnostic" }` on failure.

The runtime is QuickJS. Write ES2020 code with CommonJS-style `module.exports = { ... }`; `module.exports.default` is also accepted. This is an export wrapper, not a full Node.js environment. There is no `require` module loader, Node.js built-in modules, filesystem, database access, subprocess API, DOM, or browser storage. Do not depend on `URL`, `URLSearchParams`, `Buffer`, `FormData`, `AbortController`, `setTimeout`, `console`, `Intl` (including locale-aware `toLocaleString` formatting), or browser SDKs; `inscura run` removes them from its sandbox so such code fails before delivery. Encode query values with `encodeURIComponent`. If developing from TypeScript or npm source, bundle it into a single CommonJS file with no external dependencies or runtime `require` calls.

`ctx`:

```ts
{
  config: Record<string, unknown>;
  request: { provider?: string; year?: number | null; tvScope?: TvScope };
  fetch: (url: string, options?: FetchOptions) => Promise<FetchResponse>;
  log: { info(message: string): void; warn(message: string): void; error(message: string): void };
  app: { version: string; locale: string };
}
```

- Search methods read the selected source from `ctx.request.provider`. Media and TV searches also receive a nullable `year`. Detail methods already receive an explicit `provider` argument. For `test`, `request` is an empty object.
- `config` merges user settings with manifest defaults. The host injects the global scraping language as `config.language`; do not override it with a configuration field of the same name. `app.locale` is the application's interface language, which is distinct from the requested content language.
- Pass one string per log call; format objects before logging. Never log tokens, complete authenticated URLs, request headers, account data, or unsanitized upstream responses.
- Do not rely on in-memory state surviving between calls, background work, or persistent connections. Plugins supply remote metadata and resource URLs. The host handles resource downloads and library writes.

## HTTP Capabilities

```ts
interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}
interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}
```

`ctx.fetch` sends requests through the host's HTTP client. GET is the default. Only the listed methods are recognized; other methods, including HEAD, fall back to GET. For a JSON request, serialize the body with `JSON.stringify` and set `Content-Type`. The response exposes only `ok`, `status`, `text`, and `json`. It has no `headers`, `statusText`, `url`, streams, binary body methods, `blob`, `arrayBuffer`, or cookie session interface. `Retry-After` cannot be read.

`timeoutMs` is measured in milliseconds. Missing, nonfinite, or nonpositive values use `30000`. Positive values are rounded down and clamped to `1..180000`. Do not substitute `timeout`, a value in seconds, or `signal`. Network and timeout errors reject the promise; HTTP responses such as 404, 429, and 500 still resolve, so explicitly inspect `response.ok` and `response.status`. Avoid unbounded concurrency, recursive retries, and busy-wait delays. Respect upstream rate limits; for 429, provide an actionable diagnostic asking the user to try again later.

## Configuration Definitions

Each field requires `key: string`, `type: string`, and `label: Record<string,string>`. Optional properties are `required: boolean` (default false), `default` (a JSON value), `placeholder` and `help` (locale-keyed text), `options` (described below), and numeric `min` and `max`. The host accepts English labels under `en`; generated plugins should supply `en`, `zh-CN`, `zh-TW`, `ja` and `ko` for all labels and every supplied help/placeholder, including provider, option and scrape-field labels. `required` describes the configuration field; it does not replace validation of missing values and types inside the plugin.

| Type | Value and requirements |
| --- | --- |
| `text`, `password` | String. Use `password` for API keys and tokens, with an empty default. A password control masks input; it does not promise encrypted storage. |
| `number` | JSON number. May declare min/max; code must still validate finiteness and range. |
| `boolean` | JSON boolean. |
| `select`, `radio` | One option value. Provide `options`. |
| `multiSelect`, `checkboxGroup` | Array of option values. `default` must also be an array. Provide `options`. |

An `options` element is `{ value: string | number | boolean, label: { "en": "Option label" } }`. Prefer string or numeric values for checkbox groups. Do not include real secrets in configuration definitions. Validate the scheme and destination of configurable URLs to avoid sending authentication headers to unintended addresses.

## Scrape Field Declarations

```json
{
  "id": "title", "key": "title", "provider": "example",
  "kind": "standard", "fieldType": "text",
  "label": { "en": "Title" },
  "translatable": true
}
```

Each declaration requires `id`, `key`, `provider`, `kind`, `fieldType`, and `label`. `translatable` defaults to true; generated declarations should set it explicitly. Use `standard` or `custom` for `kind`. A standard field must have `id === key` and appear in the allowlist below; otherwise the host filters it out. Standard fields represent user-selectable concepts and do not necessarily share the names of detail JSON properties. Natural-language metadata may be translated; explicitly set `translatable: false` for numbers, dates, URLs, IDs, codes and images, including their string forms. Media `originalTitle` is always nontranslatable. Declaring a container translatable does not prove that every nested string is processed by the host; follow [translation checks](verification.md#localization-and-translation). See [shared nested types](result-types.md#shared-nested-types) for custom field types and values.

| Capability | Complete standard field allowlist |
| --- | --- |
| media | `code`, `title`, `originalTitle`, `description`, `releaseDate`, `rating`, `portraitCover`, `backdrop`, `screenshot`, `previewVideo`, `photos`, `maker`, `collections`, `label`, `genres`, `tags`, `series`, `cast`, `crew`, `roles` |
| actor | `name`, `description`, `birthday`, `debutDate`, `height`, `measurements`, `nationality`, `gender`, `avatar`, `photos`, `skills`, `tags`, `socialLinks` |
| tv | `title`, `originalTitle`, `tagline`, `description`, `year`, `firstAired`, `lastAired`, `contentRating`, `averageRuntime`, `rating`, `aliases`, `externalIds`, `tvGenre`, `network`, `tvStudio`, `tvTag`, `tvStatus`, `cast`, `crew`, `trailer`, `poster`, `backdrop`, `banner`, `logo`, `clearart`, `photos`, `seasons`, `episodes` |

For example, the media standard fields `code`, `description`, and `rating` correspond to detail properties `number`, `summary`, and `score`. Do not copy manifest field names directly into result objects. TV `episodeCatalogs`, `artworks`, and `sourceUrl` are detail transport properties, not standard fields; do not add them to the allowlist. Declare only fields genuinely supported by the source.

## TV Scope and Episode Catalogs

```ts
interface TvScope {
  seasons: Array<{ seasonNumber: number; episodeNumbers: number[] }>;
}
```

For `getTvDetail`, `ctx.request.tvScope` identifies existing, visible local seasons and episodes:

1. Return `seasons` details only for seasons whose `episodeNumbers` is nonempty. Return `episodes` details and episode artwork only for exact `(seasonNumber, episodeNumber)` matches. Do not create media for unmatched remote episodes or guess local episode numbers.
2. `episodeCatalogs` is independent of detail records. After successfully obtaining a **complete official episode catalog** for a season in scope, return all its episode numbers and optional titles, not just locally owned episodes. This does not require requesting each episode's detail separately.
3. `episodeNumbers: []` identifies an existing empty season. It allows a complete catalog but not season details, episode details, or season/episode artwork. It does not mean "request all details for this season."
4. `tvScope.seasons: []` means there is no season/episode scope; do not expand it into a full-show scrape. If `tvScope` is absent, full show, season, episode, and catalog data may be returned. Prefer endpoints that return lists in one request, such as TVmaze, and avoid unbounded per-episode requests. The host still trims results to visible local media.
5. Missing or `null` `episodeCatalogs` means no catalog was provided. An explicit season entry such as `{ seasonNumber: 1, episodes: [] }` means a confirmed empty catalog and replaces that season's catalog. Do not use it to hide a network failure, incomplete pagination, or unknown episode numbers.
6. Do not repeat a season catalog. Episode numbers must be nonnegative integers. For specials with null official numbers, do not invent numbers from array indexes or IDs. Preserve official season 0 and episode 0 when explicitly supplied by the source.

Catalogs follow the `episodes` field selection and translation settings. Catalog entries do not create media records. Although the host also trims the scope, plugins should follow it proactively to reduce requests and incorrect data.

## Errors and Verification Claims

Third-party JavaScript plugins cannot register arbitrary application translation keys. Throw a brief `Error` with stable, secret-free diagnostics for HTTP status failures, missing configuration, and invalid data. The host wraps plugin failures in its own error contract, so the plugin's message is not guaranteed to appear verbatim in the interface. Do not reuse error prefixes reserved for a particular host service or return an error-shaped object as a detail result. Do not claim support for arbitrary localized errors.

Mock checks establish only mapping, declaration, and package behavior. Real installation, QuickJS execution, network connectivity, and application behavior must be verified separately and reported accurately. Plugins must not touch original media or bypass authentication, paywalls, CAPTCHAs, rate limits, or access restrictions.
