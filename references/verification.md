# Verify a generated plugin

Track package validity, JavaScript execution, result mapping, source availability, and application behavior separately. A successful request does not validate every provider. A public version endpoint does not necessarily validate an API token.

## Inspect the source contract

Inspect documented search/detail routes, authentication, pagination, response envelopes, and provider discovery. Record the service version. Aggregators may expose different providers for different capabilities; use the actual per-capability IDs and refresh the snapshot when updating an adapter.

Check the final provider when an upstream service can identify URLs or fall back to another result. Never silently rewrite an entity's identity. Treat search 404 as no matches only when documented; a detail 404 or an upstream timeout must not become successful empty data. Choose a real, lightweight, read-only endpoint for `test(ctx)`.

An explicitly supplied local address such as `http://localhost:8080` is valid. Prefer HTTPS for public remote services. Handle trailing slashes and existing path prefixes; reject embedded user/password credentials, accidental queries, and fragments in the base URL. Use configuration fields and authentication headers for tokens, never an update URL. A password input does not itself guarantee encrypted storage.

## Check raw results

Execute reviewed generated code with synthetic/sanitized fixtures or an authorized read-only service. Save the **plugin's return value** as JSON, not the upstream envelope such as `{data: ...}`.

```sh
python3 scripts/check_result.py media search /path/to/media-search.json --provider chosen-source
python3 scripts/check_result.py media detail /path/to/media-detail.json --provider chosen-source
python3 scripts/check_result.py actor detail /path/to/actor-detail.json --provider chosen-source
```

Capabilities are `media`, `actor`, and `tv`; operations are `search` and `detail`. Check both operations for every declared capability. Unknown properties such as actor `avatarUrl` or movie `description` are rejected, along with invalid identities, nulls, types, ranges, and nested values.

The checker targets raw plugin output **before host deserialization**, not objects that the host has filled with empty-string defaults. Omit missing optional dates, URLs, and heights. A passing check does not prove persistence, provider authorization, or image rights.

Cover successful search/detail, no matches, missing optional fields, and applicable authentication, detail-not-found, rate-limit, invalid JSON, and invalid-envelope errors. Record which cases were actually executed. For TV, also verify scope filtering, empty-season catalogs, official zero-numbered episodes, and unnumbered specials. The JSON checker does not establish catalog completeness or request-scope compliance.

Verify ratings, dates, and durations against each provider's documented units. Do not apply one provider's five-star conversion to unrelated providers. A source being listed does not mean it is currently reachable; record unavailable sources separately from adapter failures.

## Check the released Inscura application

Use the application's normal plugin management controls:

1. Confirm the target library and check for an existing plugin with the same ID before installing, to avoid replacing a user installation accidentally.
2. Install the generated ZIP, enter any required configuration, then run its connection test and enable it. Keep existing default scraper choices unless the user asks to change them.
3. Select the new plugin and a known provider. Search for a known item, inspect a candidate's details, and verify representative fields. Repeat for each supported capability and confirm that no matches and real failures remain distinguishable.
4. Do not apply metadata, download images, or invoke paid translation services merely to prove search/detail behavior. If the user also requests library-write verification, agree on the specific test item and fields first. Always preserve original media files.

If the assistant cannot interact with the installed application, give the ZIP and these steps to the user. Ask for the observed result or error and continue from that evidence. Do not invent an application test result or require a development build.

Keep a concise local record: service version, plugin ZIP SHA-256, platform/application version, selected providers, result counts, field assertions, failure categories, final plugin state, and untested scope. Do not publish credentials, full private responses, or local library paths. Report whether the evidence came from fixtures, real API requests, or the installed application.
