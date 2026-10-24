# Verify a Generated Plugin

Track four levels separately and report exactly which ones were reached:

1. **Static**: `inscura validate` passed (manifest, package tree, exports, syntax, sandbox load).
2. **Fixtures**: every declared method ran in the sandbox against synthetic or sanitized responses, with `--check`.
3. **Live API**: methods ran against the real service (`--live`), read-only, with authorized credentials if needed.
4. **In-app**: the ZIP was installed in an actual Inscura app and the documented methods were exercised. Record app version/build, OS and whether it was a development or released build. A bridge command is evidence only for the real host path it executed; installation, runtime, UI, persistence and translation are separate observations.

A successful request does not validate every provider, and a public discovery/version endpoint does not prove an API key works. Report each level as passed, failed or not run with the methods/providers tested. If live requests fail because a server or upstream provider is unavailable, retain that limitation after fixtures pass; do not substitute fixtures and label the overall result live-verified. The toolkit must work without a local Inscura source checkout.

Start the generated README Verification section with a four-row table: level, status (`passed`, `partial`, `failed`, `not run`), and evidence/remaining gap. In-app stays `not run` without an actual app execution record. Use these individual statuses in the delivery summary as well; do not preface them with a blanket claim that every level was run or passed.

## Inspect the source first

Read the documented search and detail routes, authentication, pagination, response envelopes, rate limits and error behavior. Record the documentation URL and the date you checked it. Check whether search 404 means "no results" (rare; only then use `request(..., { notFound: [] })`). A detail 404 or a timeout must never become an empty success. Choose a lightweight, documented, read-only endpoint for `test(ctx)` that also exercises the credential. Do not assume `/health` exists.

## Run methods in the sandbox

All commands below use the toolkit in the skill checkout; `<plugin>` is the generated source directory outside that checkout. Reset inherited verification claims before testing. Never substitute passing tests on `examples/*` for tests on the generated copy. Keep a local verification ledger with each command or assertion, method, settings, outcome and log path, including failures and skipped levels. Derive README and delivery claims from that ledger: an unexecuted option variant or error case stays untested, even when the reference has coverage. Claim a discovery list matches only after comparing the complete response, not a truncated preview.

```sh
node tools/inscura.mjs run <plugin> test --fixtures <plugin>/fixtures/api.json --check
node tools/inscura.mjs run <plugin> searchMedia "Alien" --fixtures <plugin>/fixtures/api.json --check
node tools/inscura.mjs run <plugin> getMediaDetail 348 --fixtures <plugin>/fixtures/api.json --check
node tools/inscura.mjs run <plugin> getMediaDetail 0 --fixtures <plugin>/fixtures/api.json --expect-error
```

The sandbox is a fresh JavaScript realm without `require`, timers, `URL`, `console` or `Intl`, and a mock `ctx` that matches the host: merged config defaults, `config.language`, `request.provider`/`year`/`tvScope`, `fetch` and `log`. It prints the raw return value as JSON (stdout) and diagnostics (stderr). It checks runtime compatibility but is neither a security boundary nor QuickJS itself.

`--check` validates the result shape (unknown properties, null rules, types, ranges, nested credits, photos, external IDs), search providers against the capability's manifest declarations, and detail provider/ID against the request. Aggregate search can return declared concrete providers; standalone `check --provider` still requires exact provider equality because it has no manifest context. With `--scope` on `getTvDetail`, it also checks that seasons, episodes, catalogs and artwork stay within the requested scope. `run` always fails when a request has no fixture, when the result contains `NaN`, `Date` objects or other non-JSON values, or when a configured password value leaks into the result.

### Fixtures

A fixture file maps requests to canned responses:

```json
{
  "requests": [
    { "url": "https://api.example.com/search?q=Alien&api_key=***", "json": [{ "id": 348, "title": "Alien" }] },
    { "url": "https://api.example.com/movie/0?api_key=***", "status": 404, "json": { "status_message": "Not found" } },
    { "method": "GET", "url": "https://api.example.com/movie/", "match": "prefix", "status": 429, "text": "Too Many Requests" },
    { "url": "https://api.example.com/down", "networkError": true }
  ]
}
```

URLs are matched after redaction: every configured password value is replaced by `***`, so fixtures never need the real key. Matching is exact unless `"match": "prefix"`.

Two ways to build fixtures:

- **Synthetic**: write small responses by hand from the documented schema. Always do this for error cases (401, 404, 429, invalid JSON via `"text": "<html>"`, network errors) and edge cases (missing optional fields, null images, unnumbered TV specials, season 0 and episode 0).
- **Recorded**: `run ... --record <plugin>/fixtures/live.json` performs real requests and saves redacted responses. Trim them to what the tests need, and do not keep private or licensed data you may not redistribute. Recorded fixtures are never packaged (the ZIP uses an allowlist).

Credentials for `--live`/`--record` go in a file outside the plugin directory, passed as `--config @/path/to/secrets.json`. Never put them on the command line in shared logs, in fixtures, or in chat.

### Cases to cover

For every declared capability: a matching search, a no-match search (`[]`), a detail with full data, a detail with optional fields missing, and the failures that apply (missing key, 401/403, detail 404, 429, invalid JSON, malformed envelope). Use `--expect-error` for failures; it passes only when the method throws a real `Error` whose message contains no secret.

For TV, also run `getTvDetail` with `--scope`:

```sh
node tools/inscura.mjs run <plugin> getTvDetail 169 --fixtures <fixtures> --check \
  --scope '{"seasons":[{"seasonNumber":1,"episodeNumbers":[1,2]},{"seasonNumber":2,"episodeNumbers":[]}]}'
node tools/inscura.mjs run <plugin> getTvDetail 169 --fixtures <fixtures> --check --scope '{"seasons":[]}'
```

The first must return season 1 details, S01E01 and S01E02 only, and complete catalogs for seasons 1 and 2. The second must return show metadata without seasons or episodes. `--check` cannot prove a catalog is complete; compare it with the source.

Verify ratings, dates and durations against each provider's documented units. Do not reuse one provider's scale conversion for another. Record unreachable upstream providers separately from adapter defects.

### Settings behavior

Exercise the recommended default profile and each setting's meaningful alternate state. Check observable requests and output, not just manifest presence: omitted optional requests, limited galleries, chosen video format, lazy/full query parameters, or declared custom fields. Cover invalid types and bounds where user input is accepted. For aggregators, cover default selection, multiple sources, concrete-provider precedence, `(provider, id)` deduplication and an undeclared response provider. Verify disabled parent options suppress their dependent enrichment.

### Images: mapping, retrieval and application

Images are the most important assets. Exercise the installed default profile by supplying only required connection settings and merging manifest defaults, without forcing `includeImages=true` in the test. Compare source images to search and detail output for each supported capability: primary posters/covers, large variants, portraits, galleries and nested TV artwork. Assert available categories remain populated; omit genuinely missing source values without inventing URLs. Also test explicit master-off, sub-switch-off and zero-limit choices, including nested/custom image fields.

A JSON URL is only mapping evidence. For representative returned URLs, separately check the actual HTTP response and decodable image bytes; redirects, HTML error bodies, authentication and access failures matter. Never embed credentials in image URLs, and do not assume the host image downloader reuses the metadata API authorization headers. If the source offers a documented image proxy, verify it before recommending it. Preserve unsuccessful URL checks rather than masking them by disabling images.

Save representative images from each capability outside the plugin directory and actually decode them, for example with Pillow `Image.open(path).load()`, ImageMagick conversion, or macOS `sips -s format png input --out decoded.png`. Record the decoder command and outcome alongside URL, HTTP status and content type. A successful HTTP response or format/size inspection is not decoding evidence; if no decoder ran successfully, write **decoding: not run/failed**, never "decodable bytes" or an overall image pass.

When image application is authorized, use the generated ZIP in an isolated test library and record actual host download, persisted file existence/nonzero size/image decoding, metadata-to-image linkage, and visible display. Report mapping, URL retrieval, host download, persistence and UI display separately; passing an earlier stage does not prove a later one. Retain failed source categories and unavailable app access as explicit limitations.

### Reuse source behavior suites

For adaptations of the TVmaze or MetaTube references that retain their recommended configuration, run the source suite against the generated directory. Set `REPORT_DIR` to an existing evidence directory outside the plugin and `TMPDIR` to your test workspace's temporary directory:

```sh
INSCURA_TVMAZE_PLUGIN_DIR="$PLUGIN_DIR" node --test "$SKILL_DIR/checks/tvmaze.mjs" > "$REPORT_DIR/tvmaze-checks.log" 2>&1
INSCURA_METATUBE_PLUGIN_DIR="$PLUGIN_DIR" node --test "$SKILL_DIR/checks/metatube.mjs" > "$REPORT_DIR/metatube-checks.log" 2>&1
```

Use the command for the selected source, retain its exit status and inspect the check report, including failures/skips. A target-directory variable is required; missing, empty or whitespace-only values fail rather than selecting a reference. The report identifies the target plugin and covers defaults, alternate settings, identity, mapping/errors, localization and copied-package checks; TVmaze also covers scopes/catalogs and MetaTube covers aggregate-provider precedence. MetaTube's profile check requires each exercised control to be exposed in the manifest with its recommended type/default and tested options; runtime fallbacks alone do not make it configurable. Additional controls are allowed. These suites use toolkit-owned synthetic data, perform no live calls, and only pack temporary copies. Run them again with `PLUGIN_DIR` pointing at the extracted final ZIP when the profile still matches.

They are reference-profile checks, not extra contract requirements for every plugin. When the user intentionally changes settings or capabilities, adapt the relevant behavior cases and report what was omitted; do not force a custom plugin to have the reference's setting count or claim an unmodified suite covered a different profile. Live API and in-app verification remain separate.

### Localization and translation

Keep three claims separate: **manifest localization** is the settings/field UI; **source language** is an upstream API feature; **host translation** processes selected metadata after fetching. Source text does not become translated merely because a manifest has five-language labels.

1. Check `en`, `zh-CN`, `zh-TW`, `ja` and `ko` on provider/config/field labels and all supplied option labels, help and placeholders. Proper source names can remain unchanged. Test one interface locale change when the app is available.
2. Audit returned text against declarations for every actual provider. Titles, summaries, biographies, genres, natural-language tags and suitable custom text/select values may be translatable. IDs, URLs, dates, codes, ratings, sizes and protocol values remain false even when represented as strings. Do not enable translation of `originalTitle` merely to increase coverage.
3. Include nested fixtures with credits (names, aliases, role/job/character text), TV seasons and episodes (titles/descriptions), episode catalog titles, and custom fields. Preserve machine identity such as provider actor IDs, role slugs and credit IDs. Declare supported containers using their standard field IDs; do not invent keys such as `cast.name` or `episodeCatalogs` in the manifest.
4. Compare fixture output, declarations and the host's documented translation boundary. `run --check` checks shapes, not the host translation pipeline. A `translatable` flag is eligibility, not evidence of complete traversal. Record unsupported or unverified nested members rather than claiming every text field is translated. Catalog titles follow the host's `episodes` selection; they are not a separate selectable field.
5. A real translation check requires an available configured service and authorization for any paid operation. With that authorization, use an isolated test library, verify selected and excluded fields and preserved IDs, and report exactly what changed. Otherwise report declaration/fixture coverage only; do not trigger paid translation just to obtain a passing claim.

Host translation traversal varies by build, especially nested credits/roles, studios, collections and custom fields. Preserve the reference/scaffold eligibility choices unless verified behavior supports a change; report unverified traversal separately. Actor `gender` remains nontranslatable. Reading local app source is optional, never a prerequisite for generating a plugin.

## Verify a search-to-detail chain

Use the deterministic smoke tool for each capability, on the generated plugin and again on the extracted archive:

```sh
node "$SKILL_DIR/tools/smoke.mjs" "$PLUGIN_DIR" tv "Demo Show" --fixtures "$FIXTURES" --scope '{"seasons":[{"seasonNumber":1,"episodeNumbers":[1]}]}'
node "$SKILL_DIR/tools/smoke.mjs" "$PLUGIN_DIR" actor "Demo Actor" --fixtures "$FIXTURES"
node "$SKILL_DIR/tools/smoke.mjs" "$PLUGIN_DIR" media "match" --provider MetaTube --config @"$TEST_CONFIG" --fixtures "$FIXTURES"
node "$SKILL_DIR/tools/smoke.mjs" "$PLUGIN_DIR" actor "$KNOWN_PERSON_QUERY" --live --config @"$LIVE_CONFIG" > "$REPORT_DIR/actor-live.json"
```

Its JSON is a chain summary: `methods` contains method names, not their response bodies. To inspect returned artwork, run `inscura run <plugin> <detail-method> <candidate.id> --provider <candidate.provider> --live --check` with the same connection settings, and save that result outside the plugin. Use those returned image URLs for the retrieval/decoding checks above.

Choose the calls and queries that match the source. For live runs, use a known title/person from the actual provider's public documentation or catalog; unrelated queries returning no matches test emptiness only. The tool validates the plugin, runs `test`, searches, selects the first returned candidate and requests its exact provider/ID before checking detail identity and shape. A separate hardcoded detail ID cannot establish a chain. Empty search, method failure, unmatched fixtures and identity mismatch exit nonzero with a failed stage. Keep the JSON report and exit status; they contain plugin/candidate identity and methods, not source metadata, configuration or plugin logs. Use ordinary `inscura run` to diagnose failed stages, and preserve unresolved failures in the delivery record.

## Check a saved result

```sh
node tools/inscura.mjs check media detail /path/to/result.json --provider tmdb
```

Use the plugin's raw return value, not the upstream envelope and not objects the host already filled with defaults.

## Check in Inscura

Use the app's normal plugin management:

1. Check for an existing plugin with the same ID before installing, to avoid replacing a user's installation.
2. Install the ZIP, fill in the settings, enable it (this runs `test(ctx)`). Keep existing default scraper choices unless the user asks otherwise. Prefer an isolated test library when the authorized test requires library context, and record whether execution used the normal UI or a bridge invoking real host methods.
3. Search for a known item with the new plugin and provider, open a candidate's details, and compare representative fields. Repeat for each capability. Confirm that "no results" and real failures look different.
4. Search/detail verification does not require applying metadata, downloading images or paid translation. If these behaviors are explicitly in scope, verify them separately with authorized test data and preserve original media files. Success in a development build is not release compatibility evidence.

If you cannot operate the app, give the user the ZIP and these steps, ask for the result or error message, and continue from that evidence. Never invent an in-app result.

## Check the delivered archive

`pack` refreshes the source README settings table, so package only the output copy. Extract the ZIP to a fresh directory, run `validate` there and repeat one search → detail chain for each capability using fixtures/config outside the extraction directory. Confirm source identity and entry bytes match the intended output. Tests that run only before packing do not establish which files were shipped.

Keep a short record in the plugin README's Verification section: date, documentation checked, levels reached, methods/providers/cases run, exact app build when used, and failures or untested areas. Put the final ZIP SHA-256 and archive checks in a separate delivery report; a ZIP cannot contain its own final hash. Keep credentials, private responses, deployment/test server addresses, local library paths and user media names out of distributable documentation and fixtures. Use a generic server-URL placeholder in installation instructions; the actual address belongs in the private test configuration or local delivery note. Check the allowlisted ZIP contents for these values before delivery, not only the manifest defaults.
