# Ahmed's Obsidian Tools

A personal, mobile-compatible umbrella plugin for Ahmed's Obsidian workflows. Its first feature adds a project-linked Kanban card directly from a project note.

The repository is prepared for distribution through GitHub Releases and installation or updates with [BRAT](https://github.com/TfTHacker/obsidian42-brat). The intended release assets are `main.js`, `manifest.json`, and `styles.css`; repository contents alone do not mean that a release has been published. The plugin is not intended for Obsidian's Community Plugin marketplace.

Future features should remain isolated and independently tested inside this plugin rather than becoming tightly coupled to Project Task Capture.

## Project Task Capture

A `project-task-add` code block renders an **＋ Add task** button. Submitting the modal atomically inserts one card into the configured lane of the configured Markdown Kanban board.

Default card format:

```markdown
- [ ] Task text · [[20 Projects/Project Name|Project Name]]
```

Default configuration:

- Tasks board: `00 Home/Tasks Board.md`
- New-task lane: `Backlog`
- Project folder: `20 Projects/`

The plugin refuses to write when:

- The source note is outside the project folder.
- The source project note no longer exists.
- The Tasks Board is missing.
- The target lane is missing, duplicated, or appears only inside frontmatter, a fenced or indented code block, or an HTML comment.

It uses Obsidian's atomic `Vault.process()` API and does not make network requests.

## Requirements

- Obsidian 1.4.0 or newer
- Desktop or mobile
- A Markdown Kanban board containing exactly one structural level-two heading matching the configured lane

## Install with BRAT after publication

These steps apply after the `1.0.0` GitHub Release has been published and publicly verified.

1. Install and enable **BRAT** from Obsidian's Community Plugins browser.
2. Open **Settings → BRAT**.
3. Select **Add Beta Plugin**.
4. Enter:

   ```text
   ahmedsbytes/obsidian-ahmed-plugin
   ```

5. Enable **Ahmed's Obsidian Tools** under **Settings → Community plugins**.
6. Restart or reload Obsidian if the button does not appear immediately.

Once a release exists, BRAT checks GitHub Releases and installs `main.js`, `manifest.json`, and `styles.css` from it.

## Add the button to a project template

Place this under the project's Tasks heading:

````markdown
```project-task-add

```
````

A command-palette action named **Ahmed's Obsidian Tools: Add task to current project** is also available while a project note is active.

## Settings

The plugin merges the following defaults with its `data.json` file:

```json
{
  "boardPath": "00 Home/Tasks Board.md",
  "defaultStatus": "Backlog",
  "projectFolder": "20 Projects/"
}
```

There is intentionally no settings UI yet. This keeps the plugin narrowly scoped and avoids exposing a second task-status system.

`projectFolder` is normalized to include one trailing slash. It must be a non-empty relative vault folder without backslashes, empty segments, or `.` / `..` path segments; invalid loaded values prevent the plugin from registering its controls.

## Development and verification

```bash
make test-all
```

The tests cover task normalization, native Obsidian link generation, structural lane recognition, LF/CRLF preservation, path validation, modal retries, atomic insertion, missing/duplicate lanes, and fail-closed file checks.

## Release checklist

1. Confirm `package.json` and `manifest.json` both contain version `1.0.0`, and that `versions.json` maps `1.0.0` to the manifest's minimum Obsidian version.
2. Update `CHANGELOG.md` and review the repository for local paths, vault data, server URLs, credentials, and tokens. Never package `data.json`.
3. Run the complete required gate with `make test-all`.
4. Commit the verified files, then create the tag `1.0.0`. The tag and GitHub Release name must both exactly match the manifest version, with no `v` prefix.
5. Build the release payload from the tagged commit and include exactly:

   - `main.js`
   - `manifest.json`
   - `styles.css`

6. Compute SHA-256 hashes for those three payload files and compare each one with the corresponding blob from the tagged commit (for example, `git show 1.0.0:main.js | sha256sum`). Do this before upload.
7. Publish the `1.0.0` GitHub Release, download all three assets from the public release URLs, and compare their SHA-256 hashes with the tagged-commit hashes.
8. From an unauthenticated session with GitHub credentials unset, verify that each public asset URL downloads successfully. Treat any redirect to a login page or any non-success response as a failed release check.

## License

MIT
