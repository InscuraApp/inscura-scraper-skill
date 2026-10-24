# TVmaze Attribution and Usage

This independent Inscura plugin uses the [TVmaze public API](https://www.tvmaze.com/api). No API key is required. It is not endorsed by TVmaze.

## Data

Metadata is provided by [TVmaze](https://www.tvmaze.com/) under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/). Retain attribution and the license link when distributing data, identify adaptations and comply with ShareAlike where applicable. The adapter maps fields, normalizes dates, removes summary markup, derives bounded relative relevance, deduplicates aliases and filters season/episode details to local scope. It does not generate source facts or translations.

Each show/person detail returns a TVmaze `sourceUrl`. Keep visible attribution in the application or website that distributes the data; this file does not replace that requirement. Plugin source code uses the included MIT license, which does not replace the upstream data license.

## Images

No posters or portraits are distributed in the package. Images are enabled by default as core metadata assets. The plugin returns source primary image URLs, which Inscura may download when applying metadata. Review the [TVmaze copyright policy](https://www.tvmaze.com/site/copyright) and rights for the intended use. API access, hotlinking and caching permission do not establish blanket commercial or marketing rights to every image. This adapter does not fetch the full show image gallery.

## Source limits

- Official airing order is preserved. Explicit season/episode numbers, including zero, remain intact. Specials with null official episode numbers are omitted; numbering is never invented.
- A complete requested-season catalog can include episodes not locally owned. It does not create media records. An empty local season permits a catalog but not season/episode detail or artwork.
- TVmaze supplies no localization or year-filter parameter for these searches. Source aliases may help translated-name searches, but this does not guarantee every translated title will match.
- Search weights are relative relevance, not probabilities. Finite nonnegative weights use `s / (1 + s)`; unknown or invalid weights are omitted.
- People metadata does not provide a reliably mapped biography or nationality. Source country is not repurposed as nationality.
- Optional cast, crew and aliases settings control actual requests/output. Credits reference this plugin's actor capability; keep the manifest ID and `PLUGIN_ID` constant synchronized when copying.
- HTTP failures, invalid JSON and malformed data throw short diagnostics. HTTP 429 requests a later retry; there is no immediate retry loop.

API and copyright references were reviewed on 2026-10-23. See [README.md](README.md) for host translation limits and the generated output's verification status.
