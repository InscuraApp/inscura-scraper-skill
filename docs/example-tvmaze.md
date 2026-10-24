# TVmaze Reference Plugin

For TVmaze TV or people requests, copy `examples/tvmaze/` into the user's output directory and adapt that copy. Also copy `checks/fixtures/tvmaze.json` to `<plugin>/fixtures/api.json`; the example directory alone does not include these synthetic fixtures. Read the implementation before writing another TV adapter: it includes settings, provider identities, scope/catalog handling and source-specific ranking. It needs no API key or SDK. Do not edit the skill checkout while generating a user's plugin.

## Copy identity correctly

When choosing a new plugin ID, update **both** `manifest.json` → `id` and `index.js` → `PLUGIN_ID`. Credits use that constant to point to this plugin's actor methods; changing only the manifest silently leaves people linked to the old plugin. Keep `PROVIDER = "tvmaze"`, the declared providers and all returned providers consistent. Also update the display name, User-Agent, version and README ZIP filename. Replace the copied Verification section with a fresh four-level record, initially all not run. Remove reference-specific test commands and app-build claims; do not copy validation-only IDs, paths, settings or live snapshots.

The reference includes `tv` and `actor`, each with search/detail, plus `test(ctx)`. If the user wants fewer capabilities, remove their methods/declarations together and remove credit identity claims that would point to an unimplemented actor capability.

## Useful settings

| Setting | Default | Concrete effect |
| --- | --- | --- |
| `includeImages` | true | Return primary show/season/episode/person image URLs; no full show gallery. |
| `includeCast` | true | Embed main cast in the show request; disabling omits cast and the embed. |
| `includeCrew` | false | Add one show-crew request. |
| `includeAliases` | false | Add one show-alias request; deduplicate names. |

All four are boolean and validated at runtime. The default profile uses three requests for a scoped show. Crew and aliases each add one request, for at most five. Empty scope skips seasons/episodes. Source language, host field selection/translation and retries are not duplicated as plugin settings. Preserve five-language labels/help when adapting the manifest.

## Endpoints and source mapping

Base URL: `https://api.tvmaze.com`. Checked against the [official API documentation](https://www.tvmaze.com/api) on 2026-10-23.

| Task | HTTP GET | Mapping |
| --- | --- | --- |
| Search shows | `/search/shows?q=...` | Each item's `show`; keep ambiguous candidates and source relevance. |
| Show details | `/shows/{id}` with optional `embed=cast` | Basic metadata and optional main cast; HTML summaries become plain text. |
| Seasons | `/shows/{id}/seasons` | Official season `number`, dates and primary image. |
| Episodes | `/shows/{id}/episodes?specials=1` | Complete official list; match only exact season/episode pairs. |
| Crew | `/shows/{id}/crew` | Real person identity and stable structured role slug plus job text. |
| Aliases | `/shows/{id}/akas` | Source alternate names; no invented translations. |
| Search people | `/search/people?q=...` | Each item's `person`, raw ID and relative relevance. |
| Person details | `/people/{id}` | Available name, birthday, gender and image; never infer nationality from `country`. |

### Preserve relevance before automatic selection

TVmaze documents relevance-ordered search results, but numeric scores can exceed 1. Both TV and actor methods map finite nonnegative `s` to **`s / (1 + s)`**. This is an increasing relative-relevance mapping, not a probability. Do not directly copy or clamp scores, and do not discard known weights: omitted scores become equal in the host, whose year tie-breaker can promote a newer wrong title. Missing, negative, nonnumeric and nonfinite weights are omitted rather than fabricated.

Test ambiguous queries after score/year sorting. This mapping is TVmaze-specific; do not apply it to other providers without checking their score semantics.

### Scope and translation

`ctx.request.tvScope` controls details. Nonempty local season selections allow only exact local episode details; each scoped season still receives its complete official numbered catalog. A season with `episodeNumbers: []` permits only its catalog. `seasons: []` must not expand into full-show data. Preserve explicit zero; omit unnumbered specials and fail on malformed numbering. Never create catalogs from partial data or hide failed requests with empty snapshots.

TVmaze has no content-language parameter for these endpoints. UI labels, source aliases and actual host translation are different capabilities. Preserve natural-language translation declarations and `scraperPluginId`/`providerId`/`providerActorId` identity; actor gender and technical fields stay nontranslatable. Follow the [translation checks](verification.md#localization-and-translation); declaring a field eligible does not prove a particular host build traverses it. This reference returns primary images, not a full-show gallery.

## Verification and packaging

For the recommended reference profile, use this sequence against the generated copy (`PLUGIN_DIR`), with an evidence directory (`REPORT_DIR`) outside it. The suite supplies the default, option, scope and error cases; the two live smoke calls follow actual search results into details for **both** capabilities. Do not replace either live smoke call with a hardcoded detail ID.

```sh
mkdir -p "$REPORT_DIR"
INSCURA_TVMAZE_PLUGIN_DIR="$PLUGIN_DIR" node --test "$SKILL_DIR/checks/tvmaze.mjs" > "$REPORT_DIR/tvmaze-checks.log" 2>&1
node "$SKILL_DIR/tools/smoke.mjs" "$PLUGIN_DIR" tv "Breaking Bad" --live --scope '{"seasons":[{"seasonNumber":1,"episodeNumbers":[1,2]},{"seasonNumber":2,"episodeNumbers":[]}]}' > "$REPORT_DIR/tv-live.json"
node "$SKILL_DIR/tools/smoke.mjs" "$PLUGIN_DIR" actor "Bryan Cranston" --live > "$REPORT_DIR/actor-live.json"
node "$SKILL_DIR/tools/inscura.mjs" pack "$PLUGIN_DIR"
```

Inspect each exit status and report before the next stage; retain failures instead of declaring the whole sequence passed. The suite covers synthetic crew/alias and failure cases, credit identities, five-language definitions, score ordering, scopes and catalogs. Add tests only for behavior beyond that coverage. After packing, validate the extracted ZIP and run `tools/smoke.mjs` there for `tv "Demo Show"` and `actor "Demo Actor"` with the copied fixtures; see [verification](verification.md). The target-directory variable is required; missing, empty or whitespace-only values fail rather than testing the reference. Generate the README's four-level status table from these actual results, with In-app marked not run unless exercised separately.

Before recording image success, retrieve and decode representative show/episode artwork and a person portrait from the generated plugin's live detail output, following the [image evidence checks](verification.md#images-mapping-retrieval-and-application). The smoke summary and HTTP content type alone do not complete this step.

Keep the [CC BY-SA attribution](https://www.tvmaze.com/api#licensing), source links and image-rights notes in the output. The API allows at least 20 calls per 10 seconds per IP; return an actionable HTTP 429 diagnostic and avoid immediate retries. See the example README and ATTRIBUTION.md for source restrictions.
