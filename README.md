# Agent Skill Sync

Sync agent skill files from **private (and public) GitHub repositories** or a **custom registry** into your workspace under `.cursor/rules` — with a built-in browser, full-text catalog search, and one-click enable/disable.

> Works with VS Code 1.85+ and Cursor.

---

## Screenshots

![Browse repository tree](media/preview-browse.png)
*Browse the repository tree. Folders load on demand from GitHub.*

![Sync in progress](media/preview-syncing.png)
*Sync indicator with count of enabled skills.*

![Full-text catalog search](media/preview-search.png)
*Search the entire catalog — indexes once, filters locally.*

![Enabled skills list](media/preview-enabled.png)
*Manage enabled skills with a filter and one-click toggle.*

---

## Features

- Connect a **private or public** GitHub repository that hosts `.cursor/rules` (or `skills` / `.skills`).
- Browse the repository tree progressively — folders load on demand.
- Full-text catalog search — indexes the repo once, then filters locally.
- Enable / disable skills per workspace with a single click.
- Optional **custom registry** mode with category-based listing.
- GitHub authentication via the built-in GitHub provider (`read:org`, `repo` for private repositories).
- Cached catalog metadata in global storage to keep the UI responsive.

---

## Keyboard shortcut

**Focus Skill Manager:**

| OS | Default |
| --- | --- |
| **Windows / Linux** | `Ctrl+Alt+S` |
| **macOS** | `Cmd+Alt+S` |

To change it: open **Keyboard Shortcuts** (`Ctrl+K Ctrl+S` / `Cmd+K Cmd+S`), search for **"Skill Sync: Focus Sidebar"**, and assign any chord you prefer.

---

## Configuration

| Key | Description |
| --- | --- |
| `skillSync.sourceMode` | `github-repo` (default) or `custom-registry` |
| `skillSync.sourceRepository` | `owner/repo` for GitHub sources |
| `skillSync.registryUrl` | Base URL for a custom registry |
| `skillSync.categories` | Category names for the registry |
| `skillSync.optedInSkills` | Skill names currently enabled for sync |

---

## Privacy

GitHub API calls use your signed-in session token. Skill content is fetched only for skills you enable and written under `.cursor/rules` in the current workspace. Nothing leaves VS Code without an explicit sync. See [GitHub's terms](https://docs.github.com/en/site-policy) for API use.

---

## Development

```bash
npm ci
npm run lint
npm test
npm run build
```

Source lives under `src/` (extension host) and `webview-ui/` (React sidebar). The packaged extension loads `dist/extension.js` and `dist/webview.js`.

### Task runner (optional)

If you use [Task](https://taskfile.dev) (`task` on PATH — e.g. `brew install go-task/tap/go-task` on macOS), common flows are:

| Command | What it runs |
| --- | --- |
| `task` | List all tasks |
| `task deps` | `npm ci` |
| `task check` | Clean + lint + test + production build |
| `task vsix` | Full release gate + `vsce package` → `.vsix` in repo root |
| `task verify-icon` | Pull `extension/media/icon.png` from the newest VSIX into `/tmp` |
| `task install-vsix` | Install the newest `.vsix` via `cursor` or `code` CLI (run `task vsix` first) |

Everything above is a thin wrapper around the same `npm` scripts in `package.json`.

### Packaging a `.vsix`

```bash
npm ci
npm run vsix          # lint → test → production build → vsce package
```

Produces `agent-skill-sync-<version>.vsix` at the repo root (gitignored).

### Verify the Marketplace icon **before** you upload

The listing tile uses **`media/icon.png`** (must be **128×128**). The logo should **fill most of the square** at 100% zoom — not a tiny graphic in a corner.

1. **Build the VSIX**

   ```bash
   npm run vsix
   ```

2. **Extract and inspect the exact bytes that ship** (same file the Marketplace will show)

   ```bash
   npm run verify:icon
   ```

   Then open **`/tmp/agent-skill-sync-icon-from-vsix.png`** in Preview (or any viewer) at **100%** zoom. Confirm the mark is large and sharp.

   **Manual equivalent** (if you skip the script):

   ```bash
   unzip -p agent-skill-sync-0.2.1.vsix extension/media/icon.png > /tmp/icon-check.png
   open /tmp/icon-check.png   # macOS
   ```

3. **Optional — see it like the Extensions view**

   Install the VSIX locally, then open **Extensions → Agent Skill Sync** and check the icon in the detail header:

   ```bash
   code --install-extension agent-skill-sync-0.2.1.vsix
   ```

   Use a **new profile** or uninstall the previous version first so only one copy is active.

### Publishing to the Visual Studio Marketplace

**Manual upload** (no PAT needed):

1. Sign in at [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) — publisher **`KeskaLabsAB`**.
2. **Extensions → Update** → choose the `.vsix`.

**CI release** — push a `v*` tag; the [Release workflow](.github/workflows/release.yml) runs the same gates and attaches the `.vsix` to a GitHub Release automatically.

Always bump **`version`** in `package.json` before tagging so the package name, tag, and Marketplace version stay in sync.

---

## License

MIT — see [LICENSE](./LICENSE).  
Publisher: **KeskaLabsAB** · [Source & issues](https://github.com/keska-labs/enterprise-skills) · [Sponsor](https://github.com/sponsors/keska-labs)
