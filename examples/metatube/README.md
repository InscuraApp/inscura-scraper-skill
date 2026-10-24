# MetaTube Example

A reference implementation of a configurable Inscura media and actor scraper for a user-operated [MetaTube Server](https://github.com/metatube-community/metatube-sdk-go). It returns metadata and resource URLs; it has no filesystem access and never plays media.

## Configure and install

Install the delivered ZIP through Inscura → Settings → Plugins → Install from ZIP. Fill in your server URL and optional Bearer token, enable the plugin, and choose either MetaTube or a concrete source. The connection test uses the protected `/v1/db/version` route.

<!-- inscura:config:start -->
| Setting / 设置项 | Key | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| Server URL / 服务地址 | `apiUrl` | text | yes | (empty) | Your MetaTube root URL, including http:// or https://. / 填写 MetaTube 根地址，包含 http:// 或 https://。 |
| Bearer token (optional) / Bearer 令牌（可选） | `apiToken` | password | no | (empty) | Get it from your server administrator; leave empty if authentication is disabled. Sent in Authorization only. / 由服务管理员提供；未开启鉴权时留空。仅经 Authorization 请求头发送。 |
| Movie sources / 影片来源 | `movieProviders` | multiSelect | no | `["default"]` | Used only with the MetaTube source. Default or an empty list lets the server select sources; a native source selection takes priority. / 仅选中 MetaTube 时使用。默认或空列表交由服务端选择；原生来源选择优先。 |
| Actor sources / 演员来源 | `actorProviders` | multiSelect | no | `["default"]` | Used only with MetaTube. Empty/default uses server defaults; selecting a native source overrides this list. / 仅选中 MetaTube 时使用。空值/default 使用服务端默认；原生来源优先。 |
| Include cached search results / 使用缓存补全搜索 | `fallback` | boolean | no | `true` | Pass fallback to MetaTube to supplement searches from its database. This is not a plugin retry loop. / 将 fallback 交给 MetaTube，使用其数据库补全搜索结果，不代表插件重试。 |
| Detail mode / 详情模式 | `detailMode` | select | no | `"full"` (Refresh upstream / 刷新上游) | Full sends lazy=false for upstream refresh; cached sends lazy=true. / 完整模式发送 lazy=false 刷新上游；缓存模式发送 lazy=true。 |
| Include image URLs / 返回图片 URL | `includeImages` | boolean | no | `true` | Enabled by default to preserve image assets. Return image URLs; Inscura downloads supported images when applying metadata. Source image terms still apply. / 默认开启，保留重要图片资产。返回图片 URL；应用元数据时 Inscura 下载受支持的图片。仍须遵守来源图片使用条款。 |
| Image URL mode / 图片地址模式 | `imageMode` | select | no | `"proxy"` (MetaTube proxy URLs / MetaTube 代理 URL) | Proxy is recommended: MetaTube primary/backdrop endpoints distinguish posters and covers without embedding tokens. Direct uses upstream URLs. Preview photos retain their source URLs. / 推荐代理模式：MetaTube primary/backdrop 接口区分海报与封面，不拼接令牌。直连使用上游 URL；预览图片仍使用来源 URL。 |
| Include preview photos / 返回预览图片 | `includePreviewImages` | boolean | no | `true` | Requires image URLs to be enabled. / 需同时开启返回图片 URL。 |
| Maximum preview photos / 预览图片数量上限 | `maxPreviewImages` | number | no | `20` | Limit returned preview photo URLs, from 0 to 100. / 限制返回的预览图片 URL 数量，范围 0–100。 |
| Preview video URL / 预览视频 URL | `previewVideoMode` | select | no | `"auto"` (Auto / 自动) | Auto prefers HLS then MP4. The plugin returns a URL only and never plays or downloads it. / 自动优先 HLS，其次 MP4。插件只返回 URL，不播放或下载视频。 |
| Include reviews / 返回评论 | `includeReviews` | boolean | no | `false` | Makes an extra API request and imports reviews into custom text fields. Disabled by default. A failed review request is reported as an error. / 会额外请求 API，将评论放入自定义文本字段，默认关闭。评论请求失败会报错。 |
| Maximum reviews / 评论数量上限 | `maxReviews` | number | no | `5` | Limit imported reviews, from 0 to 50. Zero skips the reviews request. / 限制导入评论数量，范围 0–50。为 0 时不请求评论。 |
| Include extended actor fields / 返回演员扩展字段 | `includeActorExtendedFields` | boolean | no | `true` | Return available dates, aliases, measurements, skills and declared custom traits. Missing values stay omitted. / 返回已有日期、别名、身高三围、技能及已声明的自定义属性；缺失值不补造。 |
| Include source custom fields / 返回来源自定义字段 | `includeCustomFields` | boolean | no | `true` | Preserve source provider/ID, page and image URLs, and source runtime in minutes. Does not modify the local file duration. / 保留来源 provider/ID、页面与图片 URL、来源时长（分钟），不修改本地文件时长。 |
| Request timeout (seconds) / 请求超时（秒） | `requestTimeout` | number | no | `30` | Per-request timeout, 5–180 seconds. / 单次请求超时，5–180 秒。 |

The scraping language is injected by Inscura as `ctx.config.language`; it is not a plugin setting.
<!-- inscura:config:end -->

The 16 controls, options and field labels support English, Simplified Chinese, Traditional Chinese, Japanese and Korean. Server URL and token defaults are empty. Obtain any token from the server administrator; do not place it in the source or URL. Images are the most important assets. Image URLs and preview photos default on; only explicit user preferences disable them or set their limit to zero. Source image usage terms still apply.

Native source selection in Inscura takes precedence over `movieProviders`/`actorProviders`. Only the aggregate MetaTube selector uses those lists. An empty list, or any list containing `default`, delegates selection to the server and sends no provider parameter. Concrete lists are queried sequentially and deduplicated by provider + ID. Results keep exact source provider case and original IDs; details use those real identities, never a concatenated ID or MetaTube as a substitute.

`includeImages` controls all image URLs. Recommended proxy mode uses MetaTube primary/backdrop URLs to distinguish posters and covers without tokens; optional direct mode preserves upstream URLs. Galleries retain their original URLs. Verify actual image responses and app downloads instead of assuming either mode works from URL strings alone. Preview image count, preview video format and reviews have separate controls. `includeCustomFields` controls source provenance and runtime only: enabled reviews and actor extensions remain independent, including their declared custom fields. Zero review limit skips the optional request. Optional enrichment failures remain errors rather than silently disappearing.

## Mapping and boundaries

- Media uses `number`, `summary`, `score`, `thumbUrl`/`bigThumbUrl` and `coverUrl`/`bigCoverUrl`. Ratings are converted only for the verified FANZA 0..5 scale; other source scales are omitted until verified.
- Source runtime is a custom `duration_minutes` string, never a replacement for the actual file duration. Cast names are not fabricated into actor IDs.
- Actor height is centimeter text, photos are URL strings, and unknown optional fields/dates are omitted. Actor extension support depends on the upstream source; a control does not imply the data exists.
- Search 404 is the documented no-match response. Detail 404, 401/403/429, network failure, invalid JSON, malformed envelopes and mismatched detail identities are errors. There are no automatic retries.
- `fallback` asks MetaTube to supplement search from its database. It is not a plugin retry or a switch to a different provider. Full detail sends `lazy=false`; cached detail sends `lazy=true`.
- Search/detail have no documented language parameter. The plugin does not call `/v1/translate`; host translation is separate. Text fields declare translation eligibility while IDs, dates, numeric values and URLs remain nontranslatable. Review text is a rendered text block, not independently typed review subfields. Nested credits and custom-field translation depend on the host build; validate actual results before promising complete translation.
- The manifest includes the aggregate selector, 30 known movie source IDs and Gfriends as an actor source. This is a checked compatibility snapshot, not a guarantee every source is available on every deployment. Use `/v1/providers` to verify the intended server and update matching manifest/runtime declarations when capabilities differ.

## Data source and rights

Official API routing, movie/actor schemas, authentication, image and review routes, FANZA scaling and Gfriends behavior were checked on 2026-10-23 against `metatube-community/metatube-sdk-go` commit `c62584675c593816cc07e7b5b977d14c7eb505a3`. Recheck the deployed server version when adapting the example.

The SDK is Apache-2.0 licensed; that does not license upstream metadata or images. This independently written MIT example includes no upstream SDK source, recorded metadata, credentials or image assets. Source sites retain their content rights and access policies. No published universal rate limit was found; surface HTTP 429 and let the user retry later.

## Verification

This directory is a starting implementation. For each generated plugin, the builder must follow the [MetaTube source guide](https://github.com/InscuraApp/inscura-scraper-skill/blob/main/docs/source-metatube.md) and replace the status table below with that output's results. `fixtures/api.json` contains neutral invented source data for checking mappings, not evidence that a deployed service works.

| Level | Status | Required evidence |
| --- | --- | --- |
| Static | not run | Validate the generated source and extracted ZIP. |
| Fixtures | not run | Check media/actor methods, settings, provider identity, default images and errors on the output. |
| Live API | not run | Follow real media and actor searches into detail; check representative image responses and record the actual providers. |
| In-app | not run | Record the tested app build and actual installation, scraping and image behavior. |

A working server does not establish that every upstream provider is reachable. Report unavailable providers and untested authentication separately. Keep the ZIP SHA-256 and detailed logs in a separate delivery report; credentials, private server responses and local library paths do not belong in the package.
