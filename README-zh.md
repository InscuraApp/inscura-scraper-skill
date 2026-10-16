# Inscura Scraper Skill

[English](README.md) | [简体中文](README-zh.md)

向 AI 提供 API 文档或描述需求，生成可以安装到 Inscura 的刮削插件。支持影片、演员、电视剧；附带无需 API Key 的 TVmaze 电视剧与演员示例。

## 一段提示词生成插件

将下面的提示词复制给能够读取 GitHub 仓库、运行代码并生成下载文件的 AI。AI 会自行获取 Skill 和所需文件，你无需提前下载包、安装 Skill 或执行命令。

### 直接体验 TVmaze

复制这段提示词即可开始：

```text
请使用 https://github.com/InscuraApp/inscura-scraper-skill 为 TVmaze（https://www.tvmaze.com/api）创建一个可直接安装的 Inscura 插件，支持电视剧和演员。

请自行读取仓库中的 SKILL.md，获取所需的参考文档、模板和脚本，完成插件生成、校验和 ZIP 打包。不要让我下载或安装 Skill，也不要让我执行命令。完成后直接提供插件 ZIP、可编辑源码和简短的安装说明，并如实说明完成了哪些验证。
```

### 接入其他数据源

将最后一行替换成 API 文档地址、服务的源码仓库、响应样例或需求描述：

```text
请使用 https://github.com/InscuraApp/inscura-scraper-skill 为下面的数据源创建 Inscura 刮削插件。

请自行读取 SKILL.md 并获取所需仓库文件，分析数据源文档，实现需要的能力，校验结果后直接交付可安装的插件 ZIP 和可编辑源码。不要让我下载或安装 Skill，也不要让我执行命令。仅在缺少必要信息时提问，密钥留到 Inscura 中由我填写。

我的数据源和需求：[API 文档或服务仓库地址、响应样例，或者需要哪些元数据的描述]
```

拿到 AI 生成的**插件 ZIP**后，在 Inscura 的“设置 → 插件管理”中安装，按需配置并启用即可。密钥在 Inscura 中填写；生成插件不需要先给 AI 安装 Skill。

## 维护者工具

以下命令供贡献者和维护者使用。上面的提示词流程由 AI 自行运行相应工具。

### 打包 TVmaze 示例

工具使用 Python 3.9+ 标准库；`--node-check` 还需要 Node.js 18+。不需要安装 npm 依赖。Windows 可以用 `python` 或 `py -3` 替换 `python3`。

```sh
python3 scripts/plugin_tool.py validate assets/tvmaze --node-check
python3 scripts/plugin_tool.py package assets/tvmaze /path/to/output/tvmaze-example-v1.0.0.zip --node-check
```

将输出路径替换为已有目录中的新 ZIP 路径，输出文件不能已存在。校验器检查包结构与静态契约，不能代替真实 QuickJS 执行、上游 API 和 Inscura 应用内验证。

另附 `scripts/check_result.py` 检查插件返回 JSON 的字段名、类型与空值，避免未知属性被宿主静默忽略。参见[验证指南](references/verification.md)。

### 生成分发包

```sh
python3 scripts/build_release.py --output-dir dist --node-check
```

生成可选的 Skill 归档包、TVmaze 插件 ZIP 和 SHA-256 校验清单。提示词生成流程不要求用户下载 Skill 归档包；若额外提供下载入口，应明确区分 Skill 归档包与插件安装包。脚本只生成本地文件，不提交代码、不创建 Release、不上传文件。发布前按需要完成真实应用验证。

## 兼容性与许可

面向当前 Inscura 插件 `apiVersion: 1`。接口参考按 2026-10-16 源码整理，只有 `media`、`actor`、`tv`；不会为尚未实现的能力生成可安装承诺。

Skill、脚本和新写的示例代码采用 [MIT](LICENSE)。TVmaze 数据使用其自身的 CC BY-SA 许可，图片还需核对具体使用权；见[示例署名说明](assets/tvmaze/ATTRIBUTION.md)。图片返回默认关闭，插件设置可以开启。

正式版使用普通插件安装、配置、测试和搜索界面进行验证。AI 无法操作应用时，由用户执行这些步骤并反馈结果；无需启用任何开发功能。
