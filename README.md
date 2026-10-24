# Inscura Scraper Skill

[English](README.md) | [简体中文](README-zh.md)

Have your own AI agent build a scraper plugin that installs straight into Inscura, for movies, TV shows or people, with its settings already set up.

## One prompt, one plugin

Copy this into your AI agent, then write the service you want after the last colon:

```text
Read SKILL.md from https://github.com/InscuraApp/inscura-scraper-skill and follow its workflow to build me an installable Inscura scraper plugin. Fetch the toolkit, generate useful settings, validate and package it yourself; do not ask me to run commands. You may offer one concise recommended-versus-advanced settings choice; if I already specified preferences or asked you to generate directly, use those preferences or recommended defaults. Leave API keys for me to enter in Inscura.
The service I want:
```

Examples for the last line:

- `TMDB movies and people`
- `TVmaze TV shows`
- `My self-hosted Jellyfin at http://192.168.1.10:8096, movies`
- `https://api.example.com/openapi.json (API docs or sample responses work too)`

Any agent that can browse the web and run commands works, such as Claude Code, Cursor, Codex or Gemini CLI. Your machine needs Node.js 18.13 or newer. The toolkit has no package dependencies; you do not need to install this skill or run npm install.

## After you get the plugin

The agent delivers a plugin ZIP, its editable source, and a table explaining each setting. Settings and field labels cover English, Simplified Chinese, Traditional Chinese, Japanese and Korean. Useful choices depend on the source: for example, aggregate provider filters, detail completeness, image and preview limits, or optional extended metadata. Every setting must have implemented behavior. Images are the most important assets: image switches, including previews and galleries, default on unless you explicitly request otherwise. Available source images must be preserved; a returned URL alone does not prove the app downloaded, saved or displayed it.

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

The delivery distinguishes static checks, fixture tests, live API requests and actual Inscura execution. Synthetic responses do not prove that a server or provider is reachable. See the [MetaTube guide](docs/source-metatube.md) for its source-specific settings and checks.

## Compatibility and licensing

Targets Inscura plugin `apiVersion: 1`. The contract reference reflects the host implementation as of 2026-10-16.

The skill, tools and example code use the [MIT license](LICENSE). TVmaze data is licensed CC BY-SA, and image rights are separate; see the [attribution notice](examples/tvmaze/ATTRIBUTION.md). Generated plugins must follow their own data sources' terms.
