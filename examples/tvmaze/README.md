# TVmaze Example

Inscura metadata plugin for the public [TVmaze API](https://www.tvmaze.com/api). No API key required.

## Capabilities / 能力

- TV shows (电视剧): search + detail, seasons, episodes and complete episode catalogs in official airing order
- People / actors (演员): search + basic profile

## Configuration / 配置项

<!-- inscura:config:start -->
| Setting / 设置项 | Key | Type | Required | Default | Notes |
| --- | --- | --- | --- | --- | --- |
| Include remote images / 返回远程图片 | `includeImages` | boolean | no | `false` | Data: [TVmaze](https://www.tvmaze.com/), licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Images are off by default. Review [image rights](https://www.tvmaze.com/site/copyright) before enabling; Inscura may download returned images. See ATTRIBUTION.md in the source package for mapping changes. |

The scraping language is injected by Inscura as `ctx.config.language`; it is not a plugin setting.
<!-- inscura:config:end -->

## Install / 安装

1. Inscura → Settings → Plugins → Install from ZIP, choose `tvmaze-example-v1.0.0.zip`.
2. Optionally enable images (see ATTRIBUTION.md first), then enable the plugin. Enabling runs its connection test.

## Data source / 数据源

TVmaze data is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); image rights are separate. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Verification / 验证记录

Static validation and synthetic-fixture runs (`test/tvmaze.test.mjs` in the skill repository) run in CI. Live API runs were checked on 2026-10-23.
