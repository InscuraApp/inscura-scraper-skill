# TVmaze Example

`examples/tvmaze/` is the reference implementation for TV and actor plugins: read it before implementing `getTvDetail`, especially the scope and catalog logic. If a user asks for TVmaze itself, copy the directory to the user's output directory and change it there; never edit the example in the skill checkout. It requires no API key, intermediary service, or SDK.

Try it without writing anything:

```sh
node tools/inscura.mjs validate examples/tvmaze
node tools/inscura.mjs run examples/tvmaze searchTv "Breaking Bad" --live --check
node tools/inscura.mjs run examples/tvmaze getTvDetail 101 --fixtures test/fixtures/tvmaze.json --check \
  --scope '{"seasons":[{"seasonNumber":1,"episodeNumbers":[1]},{"seasonNumber":2,"episodeNumbers":[]}]}'
```

`test/fixtures/tvmaze.json` contains small synthetic responses (invented titles, no TVmaze data) shaped like the real API.

## Endpoints and Mapping

Base URL: `https://api.tvmaze.com`. Endpoint behavior was checked against the [official API documentation](https://www.tvmaze.com/api) on 2026-10-16.

| Task | HTTP GET | Mapping |
|---|---|---|
| Search shows | `/search/shows?q=...` | Each array item's `show` is the entity. Preserve same-name candidates; do not automatically select the first result. |
| Show details | `/shows/{id}?embed=cast` | Show metadata and cast. Summaries may contain HTML. |
| Seasons | `/shows/{id}/seasons` | Map `number` to the official season number. |
| Episodes | `/shows/{id}/episodes?specials=1` | Match by the `season` and `number` pair. Never derive episode numbers from array positions. |
| Search people | `/search/people?q=...` | Each array item's `person` is the entity. |
| Person details | `/people/{id}` | Name, birthday, gender, and other available fields. Do not infer nationality from `country`. |

Do not copy TVmaze's search `score` directly into Inscura's 0-1 `matchScore`; the example omits match confidence. Normalize ratings, HTML summaries, dates, integer IDs, and nullable image fields. TVmaze does not promise translations in the user's selected language, so do not present untranslated source data as localized results.

TV detail requests receive their scope through `ctx.request.tvScope`. Return complete `episodeCatalogs` for requested seasons, but return episode details only for the requested episode numbers. Preserve explicit official season and episode numbers, including zero. Omit episodes whose upstream episode number is null; do not turn unnumbered specials into an invented S00E01. Other invalid numbering or malformed responses should fail rather than produce invented metadata.

The public service has rate limits. Keep request counts low and report HTTP 429 with a request to retry later. This example does not schedule backoff because the host exposes no JavaScript timers; do not add busy waits. A successful connectivity check does not establish that every detail endpoint has been verified.

## Data and Images

The [API license](https://www.tvmaze.com/api#licensing) is CC BY-SA. Preserve source links and licensing information. Check the ShareAlike terms when adapting or distributing licensed data. The example source code's MIT license does not replace the upstream data license.

Image URLs are disabled by default. Users may enable them in plugin settings after checking their intended use. This is a choice made by the example, not a universal requirement for every generated plugin. The API permits linking to and caching images, but that does not establish that every poster or person photo may be used for any commercial or promotional purpose. See the [TVmaze copyright policy](https://www.tvmaze.com/site/copyright) and [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Use original or appropriately licensed images for website demonstrations.

The example contains newly written adapter code and documentation, with no API data snapshots, posters, or person photos. Use this skill's [plugin contract](contract.md) and [result types](result-types.md) for the exact result shapes and field declarations.
