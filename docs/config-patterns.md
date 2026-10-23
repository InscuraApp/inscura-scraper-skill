# Plugin Settings Patterns

Plugin settings are the `config` array in `manifest.json`. Users fill them in under Inscura → Settings → Plugins; the plugin reads them from `ctx.config`. Field rules are in [contract.md](contract.md#configuration-definitions). `inscura new` writes the presets below, and `inscura pack` regenerates the settings table in the plugin README from the manifest.

## Choosing settings

Only add a setting the user really has to decide. Fewer settings mean fewer ways for the plugin to break.

| Situation | Flag for `inscura new` | Setting created |
| --- | --- | --- |
| Public API, no key (for example TVmaze) | `--auth none` (default) | none |
| API key in a header | `--auth header:X-Api-Key` | `apiKey` (password, required) |
| API key in a query parameter | `--auth query:api_key` | `apiKey` (password, required) |
| OAuth-style bearer token (for example TMDB v4 read token) | `--auth bearer` | `apiKey` labelled "Access token" |
| The user runs their own server (Jellyfin, a local aggregator, an intranet API) | `--self-hosted` | `baseUrl` (text, required) |
| The source has images whose reuse terms the user should decide | `--images on` or `--images off` | `includeImages` (boolean) |
| Slow self-hosted or remote servers | `--timeout` | `requestTimeout` (number, seconds, 5..180) |

Add `--key-url <url>` whenever there is an API key, so the settings help links to the page where users create one.

## Preset details

- **`apiKey`**: `type: "password"`, `default: ""`, `required: true`. Never put a real key in `default`, the README, fixtures you keep, or chat output. The template sends it according to `AUTH` in `index.js` and fails with "API key is not configured" when it is empty. A password field masks the input; it does not promise encrypted storage.
- **`baseUrl`**: `type: "text"`. The template accepts `http(s)://host[:port][/path]`, strips trailing slashes, and rejects embedded credentials, queries and fragments. Local `http://` addresses are valid for self-hosted servers; do not force HTTPS on them. Without `--self-hosted`, the base URL is a constant (`DEFAULT_BASE_URL`) and users cannot redirect the API key to another host.
- **`includeImages`**: `type: "boolean"`. Use `--images off` when image rights are unclear (the TVmaze example does this) and `--images on` when the API's terms clearly allow it. The template's `image(url, ctx)` helper honors it.
- **`requestTimeout`**: seconds, clamped to 5..180 and passed as `timeoutMs` to `ctx.fetch`.

## Settings the plugin must not declare

- `language`: Inscura injects the global scraping language as `ctx.config.language` (for example `zh-CN`). Use it as the API's language parameter when the API supports one; `validate` rejects a `language` setting.
- `provider` or source selectors: providers are declared in `manifest.providers`, and Inscura passes the chosen one.
- Debug switches, cache sizes, retry counts: the host has no timers or persistent state, so these cannot work.

## Other settings

When the source genuinely needs a choice the presets don't cover, add it by hand, following the contract:

- Region or certification country: `select` with `options`, for example `{ "value": "US", "label": { "en": "United States", "zh-CN": "美国" } }`.
- Adult-content filter: `boolean`, default `false`, clearly labelled.
- Rating source when an API exposes several: `select`.

Give every field an `en` and a `zh-CN` label, keep `help` short, and use `<a href="...">` links in `help` for key and terms pages. After editing the manifest, run `inscura validate`.
