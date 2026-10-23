# TVmaze Attribution and Usage

This independent Inscura example plugin uses the TVmaze public API. It does not imply that TVmaze endorses Inscura or this plugin. No API key is required. It supports TV show search, show and season details, episodes in official airing order, and people search and basic profiles. TVmaze's people database also includes crew members, so users should confirm the intended person.

Data comes from [TVmaze](https://www.tvmaze.com/). See the [TVmaze API documentation](https://www.tvmaze.com/api) for endpoints and licensing. TVmaze API data is licensed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). Retain attribution to TVmaze and the license link when reusing the data. When distributing adapted data, comply with the applicable ShareAlike terms and identify your changes. This plugin maps fields, converts HTML summaries to plain text, normalizes dates, and filters results to the requested scope.

Every show or person detail includes a TVmaze `sourceUrl` so the host can display a source link. Keep this file and provide visible TVmaze attribution in the application or website that distributes the data. Attribution inside the package does not replace attribution required in the application.

No images are distributed with the example package. The **Include remote images** setting is disabled by default. When enabled, the plugin returns image URLs supplied by the TVmaze API, and Inscura may download those images when applying metadata. This does not transfer image copyright or establish permission for every use. Before enabling images, review the [TVmaze copyright policy](https://www.tvmaze.com/site/copyright) and the rights applicable to each image. Do not treat the API data license as blanket permission to use images in website marketing.

Implementation limits:

- Uses TVmaze's official airing order. It requests specials as well, retains explicit season and episode numbers including zero, and omits episodes with a null episode number. It does not invent S00 or sequential numbers for unnumbered specials. Catalogs contain only episodes with an official season/episode pair.
- `ctx.request.tvScope` limits returned season and episode details. A requested local season with no episodes can still receive its complete episode catalog. Catalogs do not create local media files.
- TVmaze does not provide a localization or year-filter parameter for the search endpoints used here. The plugin preserves all returned candidates instead of silently removing same-name shows by year.
- TVmaze search scores are not calibrated match probabilities. This example omits `matchScore` instead of inventing percentages; the host may display its default score.
- The person endpoint does not provide a reliably mapped biography or nationality, so the example omits those fields.
- HTTP 404, HTTP 429, invalid JSON, and malformed responses produce errors. After HTTP 429, wait before retrying. The host sandbox has no JavaScript timers, so this example does not retry immediately in a loop.
- The plugin only requests `https://api.tvmaze.com`. It does not require tokens, cookies, or passwords, and has no configuration for bypassing access restrictions.

To install, place `manifest.json`, `index.js`, and this file at the ZIP root. Install the ZIP through plugin management in Inscura Settings, then enable **TVmaze Example**. API and license information was checked on 2026-10-16.
