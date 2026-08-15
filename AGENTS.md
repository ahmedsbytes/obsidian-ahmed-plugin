# AGENTS.md

This repository follows its checked-in specification and the rules below.

## Architecture

- `main.js` is the complete Obsidian plugin runtime; no build step is required.
- This is an umbrella plugin for Ahmed's related Obsidian workflows.
- Each feature must remain isolated and independently tested.
- Project Task Capture is a one-way writer to one Markdown Kanban board.
- Kanban remains the only task-status authority.
- Tests use Node's built-in test runner with fake Obsidian infrastructure.

## Required gates

Run `make test-all` before every commit, tag, or release.

## Release rules

- Bump `manifest.json` and `versions.json` together.
- Release assets are exactly `main.js`, `manifest.json`, and `styles.css`.
- Never publish `data.json`; preserve each client's settings.
- Never add vault notes, local paths, server URLs, credentials, or tokens.
- Verify downloaded release asset hashes against the tagged commit.
