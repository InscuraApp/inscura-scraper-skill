# Inscura Scraper Skill

[English](README.md) | [简体中文](README-zh.md)

向 AI 提供 API 文档或描述需求，生成可以安装到 Inscura 的刮削插件。支持影片、演员、电视剧；附带无需 API Key 的 TVmaze 电视剧与演员示例。

## 使用

将本目录作为 `inscura-scraper-plugin` Skill 安装到支持 Agent Skills 的工具中，确保 `SKILL.md`、`references/`、`assets/` 和 `scripts/` 保持在同一目录。例如，本地 Codex 可将目录放在 `~/.codex/skills/inscura-scraper-plugin/`。

然后告诉 AI：

> 使用 $inscura-scraper-plugin，根据 https://www.tvmaze.com/api 创建一个支持电视剧和演员的插件，交付 ZIP 安装包。

也可以提供其他服务的 API 文档、OpenAPI 文件、脱敏响应样例，或描述需要哪些元数据。密钥留在 Inscura 的插件设置中填写。

拿到**插件 ZIP**后，在 Inscura 的“设置 → 插件管理”中安装，然后按需配置并启用。**Skill ZIP 用于安装到 AI 工具，插件 ZIP 用于安装到 Inscura，两者用途不同。**

## 直接打包 TVmaze 示例

工具使用 Python 3.9+ 标准库；`--node-check` 还需要 Node.js 18+。不需要安装 npm 依赖。Windows 可以用 `python` 或 `py -3` 替换 `python3`。

```sh
python3 scripts/plugin_tool.py validate assets/tvmaze --node-check
python3 scripts/plugin_tool.py package assets/tvmaze /path/to/output/tvmaze-example-v1.0.0.zip --node-check
```

将输出路径替换为已有目录中的新 ZIP 路径，输出文件不能已存在。校验器检查包结构与静态契约，不能代替真实 QuickJS 执行、上游 API 和 Inscura 应用内验证。

另附 `scripts/check_result.py` 检查插件返回 JSON 的字段名、类型与空值，避免未知属性被宿主静默忽略。参见[验证指南](references/verification.md)。

## 官网分发

```sh
python3 scripts/build_release.py --output-dir dist --node-check
```

生成 Skill ZIP、TVmaze 插件 ZIP 和 SHA-256 校验清单，可用于官网的两个独立下载入口。脚本只生成本地文件，不提交代码、不创建 Release、不上传文件。发布前按需要完成真实应用验证。

## 兼容性与许可

面向当前 Inscura 插件 `apiVersion: 1`。接口参考按 2026-10-16 源码整理，只有 `media`、`actor`、`tv`；不会为尚未实现的能力生成可安装承诺。

Skill、脚本和新写的示例代码采用 [MIT](LICENSE)。TVmaze 数据使用其自身的 CC BY-SA 许可，图片还需核对具体使用权；见[示例署名说明](assets/tvmaze/ATTRIBUTION.md)。图片返回默认关闭，插件设置可以开启。

正式版使用普通插件安装、配置、测试和搜索界面进行验证。AI 无法操作应用时，由用户执行这些步骤并反馈结果；无需启用任何开发功能。
