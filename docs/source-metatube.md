# MetaTube Source Guide

Read this only for a MetaTube Server adapter. Use official upstream responses as input and the current [Inscura result types](result-types.md) as output. Older Inscura MetaTube plugins can suggest useful settings; their result objects, aliases and manifest assumptions are not compatible reference implementations.

Official references checked 2026-10-23: [API routing](https://github.com/metatube-community/metatube-sdk-go/blob/main/route/route.go), [search](https://github.com/metatube-community/metatube-sdk-go/blob/main/route/search.go), [detail](https://github.com/metatube-community/metatube-sdk-go/blob/main/route/info.go), [movie schema](https://github.com/metatube-community/metatube-sdk-go/blob/main/model/movie.go), [actor schema](https://github.com/metatube-community/metatube-sdk-go/blob/main/model/actor.go), and [FANZA implementation](https://github.com/metatube-community/metatube-sdk-go/blob/main/provider/fanza/fanza.go). Recheck against the deployed server version when building.

## Reuse the reference

[examples/metatube](../examples/metatube/) is the maintained source-specific implementation. It includes all 16 practical settings below, current result mappings, five-language manifest labels, and neutral synthetic fixtures. Start from this reference when the requested server fits its documented contract rather than recreating its mapping from an obsolete plugin.

Use the source-specific reference branch of Stage 2: copy `examples/metatube/` into the user's output workspace **outside the skill directory**. Its manifest already derives from the toolkit scaffold; do not create a separate hand-written skeleton. For a new plugin, replace the example identity consistently:

| Change in `manifest.json` | Matching constant in `index.js` |
| --- | --- |
| `id` (unique to the generated plugin) | `PLUGIN_ID` |
| `version` | `PLUGIN_VERSION` |
| `name` | `PLUGIN` |

The runtime derives its User-Agent from those constants. Keep the aggregate `MetaTube` and upstream provider IDs separate from the plugin ID. For an intentional upgrade, preserve the installed plugin ID and increment both version values; do not rename source provider IDs as part of an upgrade. No actor credit ID should be fabricated from a name.

When the user supplies a reachable server, recheck `/v1/providers` there. Without a server URL, retain the documented reference provider snapshot, leave `apiUrl` empty, and continue fixture verification; mark deployment discovery and live API checks as not run. Update the manifest capability/provider arrays, per-provider scrape fields, source-select options and runtime `PROVIDERS` together if the deployment differs. The reference's 30 movie sources and Gfriends actor source are a verified compatibility snapshot, not a promise that all upstream sites work. Do not add actor capability to a movie-only source.

Read `index.js` and adjust existing methods/settings to the user's choices. Stage 3 does not require manufacturing TODO stubs in a complete reference. Reset the copied README Verification section to not run at all four levels, then run `inscura validate`, all declared methods with the copied `fixtures/api.json`, meaningful option variants, and any authorized live calls against the generated plugin directory. The fixtures use the non-routable test base `https://metatube.example.invalid`; supply that address through a test config, never an installed default. For example, using the generated copy (`PLUGIN_DIR`) and toolkit (`SKILL_DIR`):

```sh
node "$SKILL_DIR/tools/inscura.mjs" run "$PLUGIN_DIR" getMediaDetail movie-1 \
  --provider FANZA --fixtures "$PLUGIN_DIR/fixtures/api.json" --check \
  --config '{"apiUrl":"https://metatube.example.invalid"}'
```

For a copy retaining the reference's recommended configuration, run the [source behavior suite](verification.md#reuse-source-behavior-suites) with `INSCURA_METATUBE_PLUGIN_DIR="$PLUGIN_DIR"` and save its check report. It checks the selected copy using toolkit-owned neutral fixtures, including option variants, provider precedence and errors. [checks/metatube.mjs](../checks/metatube.mjs) requires this target variable and fails if it is missing, empty or whitespace-only. Copy only neutral synthetic fixtures when adapting the example; keep real responses, credentials, machine paths and library parameters outside the plugin and skill. Package the adapted output with the normal `inscura pack` command.

## Routes and identity

- Search uses `/v1/movies/search` or `/v1/actors/search`, with `q`, optional `provider`, and `fallback`. Responses have a `data` array. Documented search 404 means no matches; only these routes may convert it to `[]`. Do not silently skip 400, 401/403, 429, malformed JSON or network failures.
- Detail uses `/v1/movies/:provider/:id` or `/v1/actors/:provider/:id`, with `lazy=true|false`, and a `data` object. Detail 404 remains an error. Validate the envelope before mapping.
- `/v1/providers` is public discovery, with `data.movie_providers` and `data.actor_providers` maps. It cannot validate a bearer token. `test(ctx)` must call the protected, read-only `/v1/db/version`; optional discovery is separate. That route reports the database engine version, not the MetaTube application version; obtain the latter from the root index response if it is needed in the verification record.
- Send configured tokens as `Authorization: Bearer ...`; never append them to URLs. Some self-hosted deployments disable authentication. Support blank tokens only deliberately, with the same protected endpoint check.
- Declare one aggregate provider plus supported real providers from verified discovery/docs. Preserve their case-sensitive IDs in search and detail. A native concrete selection overrides `movieProviders`/`actorProviders`; only the aggregate uses those filters. Empty selection or `["default"]` omits `provider`. The reference defines any selection containing `default` as server default, including a mixed selection; document this priority when adapting it. Never send `default` upstream.
- Merge multi-provider searches by `(provider, id)`. Keep independent capability lists and matching scrape-field declarations. Do not invent actor IDs from actor names. A provider added on the server but absent from the manifest requires an updated declaration; never relabel it as the aggregate provider.

## Practical configuration

Use the following as a menu of supported behavior, not an obligation to expose every option. Recommended settings include connection, source filters and ordinary detail/resource controls; advanced choices can add optional enrichment. Respect the user's previous preference.

| Setting | Useful default | Required behavior |
| --- | --- | --- |
| Server URL / token | user configuration / empty token | Self-hosted URL validation and documented optional/required bearer auth |
| `movieProviders`, `actorProviders` | `["default"]` | `multiSelect`; apply only to aggregate search; real provider selection wins |
| `fallback` | `true` | Forward the boolean to search; enable server-side database cache completion, not cross-provider fallback |
| `detailMode` | `full` | `full` → `lazy=false`, `lazy` → `lazy=true`; explain completeness and latency |
| `includeImages` | `true` | Master switch for all image URLs, including proxy URLs and galleries; images are the most important assets and stay enabled unless the user explicitly asks to disable them |
| `imageMode` | `proxy` | MetaTube `primary`/`backdrop` distinguish poster and cover imagery; direct source URLs remain optional. Verify actual image downloads and later host access without secret query parameters |
| `includePreviewImages`, `maxPreviewImages` | enabled, 20 | Map `preview_images` to media `photos`; finite 0..100 limit, zero means none only when explicitly chosen |
| `previewVideoMode` | `auto` | `auto` prefers available HLS then MP4; `hls`, `mp4`, `off` select/omit `previewVideoUrl` |
| `includeReviews`, `maxReviews` | disabled, 5 | Request `/v1/reviews/:provider/:id` only when enabled and limit > 0; store bounded text in a declared custom field; 0..50, zero means none |
| `includeActorExtendedFields` | enabled if supported | Return verified measurements/nationality/skills and declared custom extras; explain which fields it controls |
| `includeCustomFields` | enabled in the reference | Return declared source provenance/runtime fields. `sourceUrl` remains available independently; the optional homepage custom field is a selectable provenance copy. Reviews and actor extensions have independent switches |
| `requestTimeout` | 30 seconds | Clamp 5..180 seconds and pass milliseconds to `ctx.fetch` |

Verify all source-provided image categories with only the connection configured: media search thumbnails, detail small/large posters and covers, preview photos, actor search avatars and actor detail portraits/photos. Do not enable images just in the test config: the manifest defaults used by Inscura must already enable them. Compare direct and proxy responses when needed; a valid URL alone does not prove the host can download or persist it.

Resolve dependencies: explicit image-off overrides preview images. In the reference, custom-fields-off omits source provenance only; enabled reviews and actor extension custom fields remain independent. Disabled reviews or a zero review limit must not trigger a discarded optional request. Explicitly requested enrichment failures must not be disguised as an empty result. Do not add `/v1/translate`, host-language, retry or cache settings.

## Mapping checks

- Upstream `number`, `summary`, `release_date`, `thumb_url`/`big_thumb_url`, and `cover_url`/`big_cover_url` map to current media `number`, `summary`, `releaseDate`, `thumbUrl`/`bigThumbUrl`, and `coverUrl`/`bigCoverUrl`. Do not emit legacy `code`, `description`, `rating`, `screenshotUrl` or `trailerUrl` aliases. `genres` do not automatically become `tags`.
- FANZA scores use a five-point scale; normalize verified FANZA ratings with `score10(value, 5)` for search and detail. Other providers need their own evidence; a float named `score` does not prove a ten-point scale. Omit unverified ratings rather than guessing. Test a known 4.5 → 9 conversion and missing/invalid values.
- Actor `height` becomes centimeter text, photos are URL strings, and aliases stay an array. Unknown dates and values are omitted. Blood type, cup size or hobbies require correctly declared custom fields when retained. Media runtime has no standard detail property: a custom minutes value must not overwrite the local file's duration.
- Natural-language titles, summaries, genres, biographies, hobbies and review text need appropriate translation declarations. Provider/actor IDs, source URLs, codes, units, dates and numeric strings remain nontranslatable. See [verification.md](verification.md#localization-and-translation) for nested and host-boundary checks.

## Source-specific validation

In addition to the shared verification matrix, cover aggregate/default/multiple filters, concrete-provider precedence, duplicate IDs from different providers, unknown providers, and each option's on/off effect. Check protected test success and bad-token failure separately from public discovery. Search 404 and detail 404 need opposite expectations.

Record live successes by capability and real provider. A working database endpoint does not show that every upstream site is reachable; an upstream failure is a remaining limitation, even when synthetic mapping fixtures pass. Confirm one real search → detail chain where possible, and do not claim authentication was verified against a server that accepts every token. Never save credentials, private server responses, test server addresses or user library paths in this guide or generated README.

Test configuration within its declared bounds: the reference's minimum request timeout is five seconds, so a one-second value is clamped rather than a one-second deadline. Use a response slower than the configured deadline to prove timeout behavior. Plugin output limits do not prove the host's image saving or stored-gallery behavior; report in-app verification separately.
