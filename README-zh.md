# Inscura Scraper Skill

[English](README.md) | [简体中文](README-zh.md)

让你自己的 AI Agent 生成一个能直接安装到 Inscura 的刮削插件，支持电影、电视剧和演员，配置项也会一起生成好。

## 一段话生成插件

复制下面这段话发给你的 AI Agent，然后在最后一行冒号后面写上你要接入的服务：

```text
请读取 https://github.com/InscuraApp/inscura-scraper-skill 中的 SKILL.md，并严格按照其中的流程为我生成一个可安装的 Inscura 刮削插件。自行完成工具获取、插件生成、配置项、校验和打包，不要让我执行命令；只在确实缺少关键信息时提问，密钥留到 Inscura 中由我自己填写。
我要接入的服务：
```

最后一行可以这样写：

- `TMDB 的电影和演员`
- `TVmaze 的电视剧`
- `我自己部署的 Jellyfin，地址 http://192.168.1.10:8096，刮削电影`
- `https://api.example.com/openapi.json（附上接口文档或响应样例都可以）`

Claude Code、Cursor、Codex、Gemini CLI 等能联网、能执行命令的 Agent 都可以用，电脑上需要有 Node.js 18 或更高版本。不需要提前安装这个 Skill。

## 拿到插件之后

Agent 会交付插件 ZIP、可编辑的源码，以及一张配置项说明表。

1. 打开 Inscura → 设置 → 插件管理 → 从 ZIP 安装。
2. 按说明表填写配置项，例如 API 密钥、服务地址、是否返回图片。
3. 启用插件。启用时会自动做一次连接测试。
4. 在媒体库或搜索中选用这个插件。

## 支持范围

| 类型 | 插件能力 | 说明 |
| --- | --- | --- |
| 电影 / 单部影片 | `media` | 搜索 + 详情 |
| 电视剧 | `tv` | 搜索 + 详情，含季、集和完整剧集目录 |
| 演员 / 人物 | `actor` | 搜索 + 详情 |

插件只返回元数据和图片地址，不会读取、修改或下载你的媒体文件，也不会绕过登录、付费墙或访问限制。

## 维护者

仓库结构：

- `SKILL.md`：Agent 的唯一入口，规定了分阶段的工作流程
- `tools/inscura.mjs`：零依赖的 Node CLI，提供 `new`、`validate`、`run`、`check`、`pack`、`fields` 命令
- `templates/plugin/`：脚手架模板
- `docs/`：插件协议、返回值类型、配置项模式、验证指南
- `examples/tvmaze/`：参考实现
- `test/`：回归测试

```sh
npm test
node tools/inscura.mjs help
node tools/inscura.mjs run examples/tvmaze searchTv "Breaking Bad" --live --check
node tools/inscura.mjs pack examples/tvmaze /tmp/tvmaze-example-v1.0.0.zip
```

## 兼容性与许可

面向 Inscura 插件 `apiVersion: 1`，接口参考按 2026-10-16 的宿主实现整理。

Skill、工具和示例代码采用 [MIT](LICENSE) 许可。TVmaze 的数据使用 CC BY-SA 许可，图片版权需要另行确认，详见[示例署名说明](examples/tvmaze/ATTRIBUTION.md)。生成的插件需要遵守各自数据源的条款。
