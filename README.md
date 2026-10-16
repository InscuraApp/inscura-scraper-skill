# Inscura Scraper Skill

[English](README.md) | [Simplified Chinese](README-zh.md)

Create installable Inscura metadata plugins from API documentation or a description of your needs. Supports movie, person, and TV metadata, with a TVmaze example that requires no API key.

## Generate a plugin with one prompt

Copy a prompt below into an AI assistant that can read GitHub repositories, run code, and create downloadable files. The assistant retrieves the skill and its supporting files itself. You do not need to download a skill package, install the skill, or run terminal commands.

### Try TVmaze

Copy this prompt as-is:

```text
Use https://github.com/InscuraApp/inscura-scraper-skill to create an installable Inscura plugin for TVmaze (https://www.tvmaze.com/api), supporting TV shows and people.

Read SKILL.md from the repository and retrieve the referenced guides, templates, and scripts you need. Handle retrieval, plugin generation, validation, and ZIP packaging yourself; do not ask me to download or install the skill or run commands. Complete the work and give me the plugin ZIP, editable source, and brief installation instructions, with an accurate summary of the checks performed.
```

### Use another data source

Replace the last line with an API documentation URL, a service's source repository, response samples, or a description of what you need:

```text
Use https://github.com/InscuraApp/inscura-scraper-skill to create an Inscura scraper plugin for the source described below.

Read SKILL.md and retrieve the required repository files yourself. Inspect the source documentation, implement the requested capabilities, validate the results, and deliver an installable plugin ZIP plus editable source. Do not ask me to download or install the skill or run commands. Ask only for essential missing information, and leave credentials for me to enter in Inscura.

My data source and requirements: [API documentation or service repository URL, response samples, or a description of the metadata I need]
```

Once the assistant provides the **plugin ZIP**, install it through Inscura's plugin management settings, configure it if necessary, and enable it. Credentials stay in Inscura's plugin settings. Generating a plugin does not require installing the skill into the assistant first.

## Maintainer tools

The following commands are for contributors and maintainers. The AI runs the corresponding helpers during the prompt-driven workflow above.

### Package the TVmaze example

The helpers use the Python 3.9+ standard library. `--node-check` additionally requires Node.js 18+. No npm dependencies are needed. On Windows, use `python` or `py -3` instead of `python3` if appropriate.

```sh
python3 scripts/plugin_tool.py validate assets/tvmaze --node-check
python3 scripts/plugin_tool.py package assets/tvmaze /path/to/output/tvmaze-example-v1.0.0.zip --node-check
```

Choose an existing output directory and a new ZIP filename. Packaging checks do not replace real API or application verification.

`scripts/check_result.py` also checks raw plugin results for field-name mistakes, type/null errors, and invalid nested values before the host can silently discard unknown properties. See the [verification guide](references/verification.md).

### Build distribution archives

```sh
python3 scripts/build_release.py --output-dir dist --node-check
```

This produces an optional skill archive, the TVmaze plugin ZIP, and `SHA256SUMS`. The prompt-driven workflow does not require users to download the skill archive. If offering archives separately, label the skill archive and plugin installer clearly. The script creates local files only; it does not commit, push, create a release, or upload anything. Existing outputs are never overwritten.

The skill works with the released Inscura application. Application verification uses ordinary plugin installation, configuration, test, and search/detail controls. If the assistant cannot operate the application, the user can perform these checks and report the result.

## Compatibility and licensing

Targets Inscura plugin `apiVersion: 1`. The bundled contract was checked against the host implementation on 2026-10-16 and supports `media`, `actor`, and `tv`.

The skill, helpers, and newly written example code use the [MIT license](LICENSE). TVmaze data has separate CC BY-SA terms, and image rights need separate consideration; see the [attribution notice](assets/tvmaze/ATTRIBUTION.md). Image output is disabled by default in the example and can be enabled in its settings.

Private validation outputs and locally generated integrations belong in `local-validation/`, which is excluded from Git and from release archives. The public example remains TVmaze.
