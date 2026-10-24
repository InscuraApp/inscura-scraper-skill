# TVmaze Example

A reference implementation for an Inscura plugin using the public [TVmaze API](https://www.tvmaze.com/api). It searches TV shows and people, fetches show/season/episode details and basic actor profiles, and supplies complete official episode catalogs. No API key is required.

## Configuration / 配置项

<!-- inscura:config:start -->
| Setting / 设置项 | Key | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| Include remote images / 返回远程图片 | `includeImages` | boolean | no | `true` | Enabled by default to preserve image assets. Return image URLs; Inscura downloads supported images when applying metadata. Source image terms still apply. See [image rights](https://www.tvmaze.com/site/copyright). / 默认开启，保留重要图片资产。返回图片 URL；应用元数据时 Inscura 下载受支持的图片。仍须遵守来源图片使用条款。 参见[图片版权](https://www.tvmaze.com/site/copyright)。 |
| Include main cast / 返回主要演员 | `includeCast` | boolean | no | `true` | Include show cast with linked person identities. Disabling omits the field and embedded cast request. / 返回剧集主要演员及关联人物身份；关闭后省略演员字段及嵌入请求。 |
| Include show crew / 返回剧组 | `includeCrew` | boolean | no | `false` | Fetch show-level crew. Adds one request per show detail. / 获取剧集级剧组信息，每次剧集详情增加一次请求。 |
| Include alternate show names / 返回剧集别名 | `includeAliases` | boolean | no | `false` | Fetch alternate show names. Adds one request; names are source data, not automatic translations. / 获取剧集别名并增加一次请求；别名来自数据源，并非自动翻译。 |

The scraping language is injected by Inscura as `ctx.config.language`; it is not a plugin setting.
<!-- inscura:config:end -->

Images are the most important assets and default on; disable them only when explicitly requested. The plugin returns primary show/season posters, episode stills and person portraits, not a full show gallery. All four settings are booleans. Provider, setting and field labels cover English, Simplified Chinese, Traditional Chinese, Japanese and Korean.

## Install / 安装

Inscura → Settings → Plugins → Install from ZIP → choose the delivered ZIP → review settings → enable. Enabling runs a public connection test. Pick provider **TVmaze** for TV or actor scraping. Review an existing installation with the same ID before replacing it.

## Data source / 数据源

- Official API: https://www.tvmaze.com/api; checked 2026-10-23.
- Data license: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keep TVmaze attribution and source links; see [ATTRIBUTION.md](ATTRIBUTION.md).
- Images: separate copyright applies; review the [TVmaze copyright policy](https://www.tvmaze.com/site/copyright). Returning an image URL does not grant new reuse rights.
- Public requests are limited to at least 20 calls per 10 seconds per IP. HTTP 429 produces a retry-later error; the plugin has no retry loop.

## Mapping and scope

Show details use at most five sequential requests: show with optional embedded cast, seasons, the complete episode list including specials, and optional crew/aliases. An explicitly empty scope skips season/episode requests. There are no per-episode or per-person request loops.

Episode details follow the exact local season/episode pairs. Each requested season receives its complete official numbered catalog, including a local season with no episodes. A catalog does not create local media. Explicit season/episode zero is preserved; unnumbered specials are omitted without inventing numbers. Images follow the same scope.

Cast and crew carry `scraperPluginId`, `providerId` and the original `providerActorId`. People detail returns name, available birthday/gender, optional portrait and a source URL. It does not invent biographies, nationality, physical measurements or social links. TVmaze `country` is not asserted as nationality.

TVmaze search results contain relative weights that can exceed 1. Both show and people searches use `s / (1 + s)` for finite nonnegative source weights. This increasing transform preserves relative relevance in Inscura's 0–1 `matchScore` range; it is **not a probability**. Invalid or missing weights are omitted. Preserving weights prevents the host's year tie-breaker from promoting a newer wrong title when all relevance values are absent.

## Translation compatibility

TVmaze has no language parameter for these endpoints. Five-language UI labels do not translate the returned metadata. Selected content is translated by Inscura when a configured translation service is available.

Natural-language fields, including `cast` and `crew`, are declared eligible. IDs, dates, numbers, URLs, images and actor `gender` are not. Nested credit names/roles and TV custom fields depend on the host build's translation support. Check the target build and actual results; a true declaration does not guarantee that all nested fields are translated. Original names may remain in aliases deliberately.

## Verification / 验证记录

This directory is a starting implementation. For each generated plugin, the builder must run the [TVmaze verification workflow](https://github.com/InscuraApp/inscura-scraper-skill/blob/main/docs/example-tvmaze.md#verification-and-packaging) on that output and replace the status table below. Reference history does not verify a newly delivered ZIP.

| Level | Status | Required evidence |
| --- | --- | --- |
| Static | not run | Validate the generated source and extracted ZIP. |
| Fixtures | not run | Check TV/actor methods, settings, scope/catalogs and errors on the generated output. |
| Live API | not run | Follow real TV and actor search results into detail; check representative image responses. |
| In-app | not run | Record the tested app build and actual installation, scraping and image behavior. |

Keep the ZIP SHA-256 and detailed logs in a separate delivery report. No credentials, local library paths, media files or live API snapshots belong in the package.
