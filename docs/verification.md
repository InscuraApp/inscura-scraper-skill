# Verify a Generated Plugin

Track four levels separately and report exactly which ones were reached:

1. **Static**: `inscura validate` passed (manifest, package tree, exports, syntax, sandbox load).
2. **Fixtures**: every declared method ran in the sandbox against synthetic or sanitized responses, with `--check`.
3. **Live API**: methods ran against the real service (`--live`), read-only, with authorized credentials if needed.
4. **In-app**: the ZIP was installed in the released Inscura app, enabled, and searched.

A successful request does not validate every provider, and a public version endpoint does not prove an API key works.

## Inspect the source first

Read the documented search and detail routes, authentication, pagination, response envelopes, rate limits and error behavior. Record the documentation URL and the date you checked it. Check whether search 404 means "no results" (rare; only then use `request(..., { notFound: [] })`). A detail 404 or a timeout must never become an empty success. Choose a lightweight, documented, read-only endpoint for `test(ctx)` that also exercises the credential. Do not assume `/health` exists.

## Run methods in the sandbox

All commands run from the skill checkout; `<plugin>` is the plugin source directory.

```sh
node tools/inscura.mjs run <plugin> test --fixtures <plugin>/fixtures/api.json --check
node tools/inscura.mjs run <plugin> searchMedia "Alien" --fixtures <plugin>/fixtures/api.json --check
node tools/inscura.mjs run <plugin> getMediaDetail 348 --fixtures <plugin>/fixtures/api.json --check
node tools/inscura.mjs run <plugin> getMediaDetail 0 --fixtures <plugin>/fixtures/api.json --expect-error
```

The sandbox is a fresh JavaScript realm without `require`, timers, `URL`, `console` or `Intl`, and a mock `ctx` that matches the host: merged config defaults, `config.language`, `request.provider`/`year`/`tvScope`, `fetch` and `log`. It prints the raw return value as JSON (stdout) and diagnostics (stderr). It is a development harness, not a security boundary, and it is not QuickJS itself.

`--check` validates the result shape (unknown properties, null rules, types, ranges, nested credits, photos, external IDs), that `provider` matches, and that detail `id` equals the requested ID. With `--scope` on `getTvDetail`, it also checks that seasons, episodes, catalogs and artwork stay within the requested scope. `run` always fails when a request has no fixture, when the result contains `NaN`, `Date` objects or other non-JSON values, or when a configured password value leaks into the result.

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

## Check a saved result

```sh
node tools/inscura.mjs check media detail /path/to/result.json --provider tmdb
```

Use the plugin's raw return value, not the upstream envelope and not objects the host already filled with defaults.

## Check in the released Inscura app

Use the app's normal plugin management:

1. Check for an existing plugin with the same ID before installing, to avoid replacing a user's installation.
2. Install the ZIP, fill in the settings, enable it (this runs `test(ctx)`). Keep existing default scraper choices unless the user asks otherwise.
3. Search for a known item with the new plugin and provider, open a candidate's details, and compare representative fields. Repeat for each capability. Confirm that "no results" and real failures look different.
4. Do not apply metadata, download images, or trigger paid translation just to prove search/detail. Never touch original media files.

If you cannot operate the app, give the user the ZIP and these steps, ask for the result or error message, and continue from that evidence. Never invent an in-app result.

Keep a short record in the plugin README's Verification section: date, documentation checked, levels reached, methods and cases run, ZIP SHA-256, and what remains untested. Do not record credentials, private responses or local library paths.
