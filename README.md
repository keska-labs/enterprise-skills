# Agent Skill Sync

Sync agent skill files from **private (and public) GitHub repositories** or a **custom registry** into your workspace under `.cursor/rules` — with a built-in browser, full-text catalog search, and one-click enable/disable.

> Works with VS Code 1.85+ and Cursor.

---

## Screenshots

![Browse repository tree](media/preview-browse.png)
*Browse the repository tree. Folders load on demand from GitHub.*

![Expanded repository tree](media/preview-syncing.png)
*Drill into any folder to see individual skill files.*

![Full-text catalog search](media/preview-search.png)
*Search the entire catalog — indexes once, filters locally.*

![Enabled skills list](media/preview-enabled.png)
*Manage enabled skills with a filter and one-click toggle.*

---

## Features

- Connect a **private or public** GitHub repository hosting Cursor rules and/or skill packages.
- **Two item types in one repo:** single-file **Cursor rules** (`.mdc` / `.md`) and directory-based **Skill packages** (folder + `SKILL.md` — [agentskills.io](https://agentskills.io/specification) open standard).
- Browse the repository tree progressively — folders load on demand.
- Full-text catalog search — indexes the repo once, then filters locally by name, description, and category.
- **Manage** tab: see what's installed in your workspace; enable / disable with one click.
- Optional **custom registry** mode with category-based listing.
- GitHub authentication via the built-in GitHub provider (`read:org`, `repo` for private repositories).
- Cached catalog metadata in global storage to keep the UI responsive.

---

## Repository structure

The extension scans the first directory found in this order: `.cursor/rules`, `rules`, `skills`, `.skills`.

Within that root, two item types coexist:

```
skills-repo/
├── skills/                          ← root (or .cursor/rules / rules / .skills)
│   ├── security-code-review.md      ← Cursor rule  (→ .cursor/rules/security-code-review.mdc)
│   ├── commit-message-style.mdc     ← Cursor rule  (→ .cursor/rules/commit-message-style.mdc)
│   └── pentest-toolkit/             ← Skill package (→ .cursor/skills/pentest-toolkit/)
│       ├── SKILL.md                 ←   required manifest (agentskills.io open standard)
│       ├── prompt.md
│       └── examples/
│           └── finding-report.md
```

**Cursor rules** — any `.mdc` / `.md` / `.yaml` / `.yml` file directly in the root or a category subdirectory.

**Skill packages** — a directory that contains a `SKILL.md` file following the [agentskills.io](https://agentskills.io/specification) open standard:

```markdown
---
name: pentest-toolkit
description: Structured pen-testing methodology covering OWASP Top 10. Use when performing a security assessment.
license: MIT
metadata:
  version: "1.0"
  category: Security
---

Full instructions for the agent go here.
See [prompt.md](prompt.md) for the detailed methodology.
```

The `name` field must be lowercase and match the directory name. The `metadata` block can include `version` and `category`. All files in the skill directory are synced to `.cursor/skills/<name>/` when the user enables the skill.

Skills built with `SKILL.md` are also compatible with Claude Code, GitHub Copilot, Gemini CLI, OpenAI Codex, Cursor, and any other agent that implements the open standard.

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
| `skillSync.ga4MeasurementId` | Optional GA4 ID (`G-XXXXXXXXXX`) — loads analytics **only inside the Skill Manager webview**. Empty (default) = disabled. Prefer **User** settings if you want it everywhere. |
| `skillSync.ga4AllowWithoutProductTelemetry` | Default `false`. Set **`true`** if your Measurement ID is set but GA still does not load because editor product telemetry is off (common in Cursor). See Privacy below. |

---

## Privacy

GitHub API calls use your signed-in session token. Skill content is fetched only for skills you enable and written under `.cursor/rules` in the current workspace. Nothing leaves VS Code without an explicit sync. See [GitHub's terms](https://docs.github.com/en/site-policy) for API use.

**Optional Google Analytics:** if you set `skillSync.ga4MeasurementId` to a valid **GA4** Measurement ID, the Skill Manager webview can load Google Tag Manager / Analytics and send anonymized usage events (tabs, sync outcomes, browse depth, catalog search length buckets, enabled-tab filter buckets, counts, host app, extension version, and similar metadata). Your **repository name**, **paths**, **skill names**, and **search text** are **not** sent as GA parameters. See [Google’s Privacy Policy](https://policies.google.com/privacy).

By default, GA4 also requires [VS Code / Cursor product telemetry](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting) to be enabled (`vscode.env.isTelemetryEnabled`). Many users run with telemetry off; in that case GA will **not** load until you either turn telemetry on or set **`skillSync.ga4AllowWithoutProductTelemetry": true`** so only your Measurement ID gates loading. If your ID is ignored, open **Output** and select **Agent Skill Sync** — the extension logs a one-time warning when a valid `G-...` is set but blocked by product telemetry.

**Your GA4 setup** — in **Settings → Open User Settings (JSON)** add:

```json
"skillSync.ga4MeasurementId": "G-XXXXXXXXXX",
"skillSync.ga4AllowWithoutProductTelemetry": true
```

Omit `ga4AllowWithoutProductTelemetry` (or set `false`) if you want GA to follow editor telemetry only. Replace the Measurement ID with yours from [Google Analytics](https://analytics.google.com/) (Admin → Data streams → Web stream → Measurement ID).

**Troubleshooting:** open the Skill Manager, then **Developer: Open Webview Developer Tools** on that view. In the **Console**, a failed gtag load prints a hint; in **Network**, look for `gtag/js` and `collect` requests. Ad blockers and strict privacy tools can block Google domains inside the webview.

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
   unzip -p agent-skill-sync-0.3.0.vsix extension/media/icon.png > /tmp/icon-check.png
   open /tmp/icon-check.png   # macOS
   ```

3. **Optional — see it like the Extensions view**

   Install the VSIX locally, then open **Extensions → Agent Skill Sync** and check the icon in the detail header:

   ```bash
   code --install-extension agent-skill-sync-0.3.0.vsix
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
