# Ahmed's Obsidian Tools — Specification

## Purpose

Provide one mobile-compatible umbrella plugin for Ahmed's related Obsidian workflows while keeping each feature isolated and independently tested.

The initial Project Task Capture feature allows a user to create one project-linked Markdown Kanban card while viewing a project note, without duplicating task state inside the project note.

## Authority model

- The Markdown Kanban board is the sole task-status authority.
- Project pages contain only an action control and read-only derived views.
- This plugin creates cards; it does not move, complete, delete, or synchronize status fields.

## Defaults

- Board: `00 Home/Tasks Board.md`
- New-card lane: `Backlog`
- Project folder: `20 Projects/`
- Card format: `- [ ] Task text · [[Project Path|Project Name]]`

## Functional requirements

1. Register the `project-task-add` Markdown code block.
2. Render **＋ Add task** only as an active control for notes inside the project folder.
3. Offer the same action through the command palette while a project note is active.
4. Normalize submitted text to one Markdown line.
5. Confirm the source project file still exists before writing.
6. Confirm the Tasks Board exists and is Markdown.
7. Require exactly one structural level-two target lane heading outside initial YAML frontmatter, fenced or indented code blocks, and HTML comments.
8. Insert exactly one card at the top of that lane's cards.
9. Preserve LF or CRLF line endings.
10. Use `Vault.process()` for atomic read-modify-write behavior.
11. Work on desktop and mobile (`isDesktopOnly: false`).
12. Use Obsidian's native `FileManager.generateMarkdownLink()` with validated `TFile` objects for project links.
13. Normalize the project folder to a relative path with a trailing slash and enforce its path-segment boundary.

## Failure requirements

The plugin must fail without modifying the board when:

- Task text is empty.
- The source path is outside the project folder.
- The source project disappeared.
- The board is missing.
- The target lane is missing or duplicated.

A failed modal submission must display a user-facing notice and retain enough state to retry. It must not log task text.

## Security and privacy

- No credentials, account identifiers, vault notes, or server URLs in the repository or release.
- No network calls from Ahmed's Obsidian Tools.
- No arbitrary JavaScript execution or DataviewJS dependency.
- Release assets are limited to `main.js`, `manifest.json`, and `styles.css`.

## Distribution

- Plugin ID and repository name: `obsidian-ahmed-plugin`.
- Display name: `Ahmed's Obsidian Tools`.
- Intended for a public GitHub repository and unlisted in the Obsidian Community Plugin marketplace.
- Semantic versions in `manifest.json` and `versions.json`.
- A published GitHub Release is intended to provide the three BRAT assets.
- BRAT is the intended per-client installation and update mechanism after publication.
- Future workflow features must remain isolated and independently tested inside the umbrella plugin.

## Acceptance gates

- Syntax checks pass.
- ESLint passes with zero warnings.
- Prettier check passes.
- All automated tests pass.
- Release assets match the committed files by SHA-256.
- Public release is downloadable without authentication.
