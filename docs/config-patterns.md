# Plugin Settings Patterns

Plugin settings are the `config` array in `manifest.json`; users edit them in Inscura and code reads `ctx.config`. See [contract.md](contract.md#configuration-definitions) for supported controls. `inscura new` creates connection presets and `inscura pack` regenerates the README settings table.

## Choose once, with useful defaults

After checking the source, you may offer one short choice in the user's language, for example: “Recommended: connection, image controls and the source's useful search/detail options with safe defaults. Advanced: also choose [supported optional capabilities].” This is optional; recommended defaults can be used immediately. List only options that have a concrete API or mapping effect. For a rich aggregator this can include provider filters, lazy/full details, preview limits and optional reviews; for a small public API fewer options are appropriate. Do not impose a fixed setting count.

Honor preferences already given. When the user asks to generate directly, use their stated preference or recommended defaults without another question. With no preference, preserve a matching reference's tested recommended defaults. When they ask for rich settings, implement the useful supported options with documented defaults; this does not mean enabling every optional request by default. An unanswered preference can use the recommendation. Essential missing API documentation or ambiguous source identity still needs clarification. A missing self-hosted URL or credential can be filled in Inscura later; it only prevents live verification, not generation against the documented contract.

For each setting, decide its value type, default, request or output effect, and validation. Explain additional requests, slower scraping or custom field creation in help text. Keep expensive or speculative non-image enrichment off by default. Images are the most important assets: image switches and their supported sub-switches default on, and image-count defaults must be positive unless the user explicitly requests otherwise. Do not create controls that only change the README, repeat native field selection, or promise unsupported host behavior.

## Connection presets

| Situation | `inscura new` flag | Setting |
| --- | --- | --- |
| Public API, no key | `--auth none` | none |
| API key in a header | `--auth header:X-Api-Key` | `apiKey`, password |
| API key in a query parameter | `--auth query:api_key` | `apiKey`, password |
| Bearer token | `--auth bearer` | `apiKey`, labelled Access token |
| Self-hosted server | `--self-hosted` | `baseUrl`, text |
| Image URLs | `--images on` (recommended); `--images off` only when explicitly requested | `includeImages`, boolean |
| Slow remote/self-hosted server | `--timeout` | `requestTimeout`, number, 5..180 seconds |

- **Credentials**: use an empty password default and link to the official key or server-token instructions with `--key-url`. Presets require a key; for a documented optional-token deployment, adjust both manifest requiredness and runtime validation, send no auth header when blank, and test both modes. A password control masks input; it does not promise encrypted storage. Never retain keys in source, README, fixtures, URLs or chat.
- **Server URL**: accept `http(s)://host[:port][/path]`, strip trailing slashes, reject embedded credentials, queries and fragments. Local HTTP is valid. Leave a self-hosted URL empty by default and require configuration at runtime; fixtures use an explicit test config. Without `--self-hosted`, keep the service URL fixed so a setting cannot redirect its credential.
- **Images**: all image paths, including galleries and nested artwork, must honor `includeImages`. Default it and every image sub-switch to true in both manifest and runtime; generic concerns about reuse rights do not justify silently removing the core image assets. Keep source attribution/terms visible. Explicit image-off still suppresses all image URLs, including custom fields, galleries and nested artwork. A proxy URL does not automatically carry API authorization headers when Inscura later fetches it; verify download behavior instead of assuming a syntactically valid URL works.
- **Timeout**: clamp the number and pass seconds × 1000 as `ctx.fetch`'s `timeoutMs`.

## Source-specific options

Add useful options to the generated manifest and implement them in the adapter. Examples include a region/certification country (`select`), supported content filter (`boolean`), verified rating source (`select`), image/preview limits (`number`), or optional review/extended-data requests (`boolean`). Use explicit bounds, and define whether zero means disabled or unlimited. A disabled feature should omit its values and avoid its optional requests. Host field selection remains the way to choose ordinary metadata fields; a separate control is justified when it changes source requests, completeness, resource policy or a coherent enrichment group.

For MetaTube's concrete option matrix, read [source-metatube.md](source-metatube.md).

### Aggregated providers

The normal provider selector belongs to Inscura: declare providers in `manifest.providers` and honor `ctx.request.provider`. Do not duplicate it in config for a single-source plugin.

An aggregator may additionally expose `movieProviders` or `actorProviders` as `multiSelect` filters **only for its aggregate provider**. A concrete provider selected in Inscura takes priority over these filters. Define empty/default selection unambiguously, omit a default sentinel from API requests, and merge results using `(provider, id)` identity. A result may use a different concrete provider from the aggregate selection, but it must be declared for that capability. Keep upstream provider casing. Declare scrape fields for each provider that can appear in results; a declaration only on the aggregate provider does not cover its concrete sources.

## Host-owned behavior and localization

Do not declare a `language` setting: use injected `ctx.config.language` only when the upstream API supports it. Do not duplicate host retries, caching, translation-provider choices or field selection. The plugin runtime has no timer or persistent state; a debug toggle that would expose requests or credentials is not a useful configuration option.

Provide `en`, `zh-CN`, `zh-TW`, `ja` and `ko` for provider/config/field labels and every supplied option label, help text and placeholder. Proper names may remain unchanged. Use brief help text and links to official key/terms pages. Set `translatable` explicitly by the metadata's meaning, not by its JavaScript type: natural-language text may be eligible; IDs, codes, URLs, dates, numeric measurements, ratings and protocol enums are not. See the [translation checks](verification.md#localization-and-translation) before claiming coverage.

Run `inscura validate` after edits and verify that changing each option affects requests or output as documented. Validate dependencies too: for example, image-off must override preview-image settings, and review-off must avoid the reviews endpoint. After changing defaults, reconcile the README's narrative and examples with the manifest and regenerated settings table; `pack` updates the table only.
