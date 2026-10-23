# Inscura Scraper Skill

[English](README.md) | [简体中文](README-zh.md)

Have your own AI agent build a scraper plugin that installs straight into Inscura, for movies, TV shows or people, with its settings already set up.

## One prompt, one plugin

Copy this into your AI agent, then write the service you want after the last colon:

```text
Read SKILL.md from https://github.com/InscuraApp/inscura-scraper-skill and follow its workflow exactly to build me an installable Inscura scraper plugin. Fetch the toolkit, generate the plugin and its settings, validate and package it yourself; do not ask me to run commands. Only ask if essential information is missing, and leave API keys for me to enter in Inscura.
The service I want:
```

Examples for the last line:

- `TMDB movies and people`
- `TVmaze TV shows`
- `My self-hosted Jellyfin at http://192.168.1.10:8096, movies`
- `https://api.example.com/openapi.json (API docs or sample responses work too)`

Any agent that can browse the web and run commands works, such as Claude Code, Cursor, Codex or Gemini CLI. Your machine needs Node.js 18 or newer. You do not need to install this skill first.

## After you get the plugin

The agent delivers a plugin ZIP, its editable source, and a table explaining each setting.

1. Open Inscura → Settings → Plugins → Install from ZIP.
2. Fill in the settings from the table, such as an API key, a server URL, or whether to include images.
3. Enable the plugin. Enabling runs a connection test.
4. Choose the plugin as a scraper for a library or in search.

## What it supports

| Type | Capability | Scope |
| --- | --- | --- |
| Movies and standalone media | `media` | Search and details |
| TV shows | `tv` | Search and details, including seasons, episodes and complete episode catalogs |
| People and actors | `actor` | Search and details |

Plugins return metadata and image URLs only. They never read, change or download your media files, and never bypass logins, paywalls or access restrictions.

## For maintainers

Repository layout:

- `SKILL.md`: the agent's single entry point, a staged workflow
- `tools/inscura.mjs`: zero-dependency Node CLI with `new`, `validate`, `run`, `check`, `pack` and `fields`
- `templates/plugin/`: scaffold templates
- `docs/`: plugin contract, result types, settings patterns and verification guide
- `examples/tvmaze/`: reference implementation
- `test/`: regression tests

```sh
npm test
node tools/inscura.mjs help
node tools/inscura.mjs run examples/tvmaze searchTv "Breaking Bad" --live --check
node tools/inscura.mjs pack examples/tvmaze /tmp/tvmaze-example-v1.0.0.zip
```

## Compatibility and licensing

Targets Inscura plugin `apiVersion: 1`. The contract reference reflects the host implementation as of 2026-10-16.

The skill, tools and example code use the [MIT license](LICENSE). TVmaze data is licensed CC BY-SA, and image rights are separate; see the [attribution notice](examples/tvmaze/ATTRIBUTION.md). Generated plugins must follow their own data sources' terms.
