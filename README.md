# Inscura Scraper Skill

[English](README.md) | [Simplified Chinese](README-zh.md)

Create installable Inscura metadata plugins from API documentation or a description of your needs. Supports movie, person, and TV metadata, with a TVmaze example that requires no API key.

## Use the skill

Install this directory as `inscura-scraper-plugin` in an Agent Skills-compatible assistant. Keep `SKILL.md`, `references/`, `assets/`, and `scripts/` together. For a local Codex installation, use `~/.codex/skills/inscura-scraper-plugin/`.

Then ask:

> Use $inscura-scraper-plugin to create an Inscura plugin for https://www.tvmaze.com/api with TV and person support. Deliver an installable ZIP.

You can instead supply another API's documentation, an OpenAPI file, sanitized response samples, or a description of the metadata you need. Enter any required credentials in Inscura's plugin settings.

Install the generated **plugin ZIP** in Inscura's plugin management settings, configure it, and enable it. The **skill ZIP** is for your AI assistant; it is a different download and cannot be installed as an Inscura plugin.

## Package the TVmaze example

The helpers use the Python 3.9+ standard library. `--node-check` additionally requires Node.js 18+. No npm dependencies are needed. On Windows, use `python` or `py -3` instead of `python3` if appropriate.

```sh
python3 scripts/plugin_tool.py validate assets/tvmaze --node-check
python3 scripts/plugin_tool.py package assets/tvmaze /path/to/output/tvmaze-example-v1.0.0.zip --node-check
```

Choose an existing output directory and a new ZIP filename. Packaging checks do not replace real API or application verification.

`scripts/check_result.py` also checks raw plugin results for field-name mistakes, type/null errors, and invalid nested values before the host can silently discard unknown properties. See the [verification guide](references/verification.md).

## Build website downloads

```sh
python3 scripts/build_release.py --output-dir dist --node-check
```

This produces the skill ZIP, TVmaze plugin ZIP, and `SHA256SUMS`. Use separate download links for the skill and the plugin. The script creates local files only; it does not commit, push, create a release, or upload anything. Existing outputs are never overwritten.

The skill works with the released Inscura application. Application verification uses ordinary plugin installation, configuration, test, and search/detail controls. If the assistant cannot operate the application, the user can perform these checks and report the result.

## Compatibility and licensing

Targets Inscura plugin `apiVersion: 1`. The bundled contract was checked against the host implementation on 2026-10-16 and supports `media`, `actor`, and `tv`.

The skill, helpers, and newly written example code use the [MIT license](LICENSE). TVmaze data has separate CC BY-SA terms, and image rights need separate consideration; see the [attribution notice](assets/tvmaze/ATTRIBUTION.md). Image output is disabled by default in the example and can be enabled in its settings.

Private validation outputs and locally generated integrations belong in `local-validation/`, which is excluded from Git and from release archives. The public example remains TVmaze.
