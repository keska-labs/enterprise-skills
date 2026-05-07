# Changelog

## Unreleased

- **Add GitHub Repository:** new Command Palette command **Skill Sync: Add GitHub Repository** (`skillSync.addGithubRepo`) to paste or type `owner/repo` / URL, verify via GitHub, and append as a skill source (clipboard pre-fill when it parses; optional sign-in retry). **Ask the Agent** prompts now tell the subagent to emit discovery picks with copyable `` `owner/repo` `` inline code and to end with instructions for that command plus **Manage AI Skills** for catalog picks.
- **Recommended tab:** **Refresh** and **Ask the Agent** stay in the toolbar above the loading state. Refresh cancels any in-flight ranking (via the recommendation cancellation token) and starts again; the AI-ranking badge appears once a result arrives.
- **Ask the Agent / skill-recommender:** prompts and \`agents/skill-recommender.md\` now tell the agent **not** to \`git clone\`/\`git pull\` skill catalogs; use GitHub web/API/raw HTTP and parse responses instead.

## 0.8.0

- **Public skill directories:** add optional sources **Official Agent Skills** ([officialskills.sh](https://officialskills.sh)) and **Open Agent Skills** ([skills.sh](https://skills.sh)). Both are **discovery-only** and **no longer prefetch** thousands of rows into the merged catalog (GitHub + custom registry stay cached there). Instead, the LLM prompt embeds a **short descriptor** per source (repo URL + skill-layout hint) — **no README markdown is shipped** — and the model uses its own knowledge of those well-known public repos to suggest concrete skills. The response includes `installSource` (`owner/repo`, optional `skillPath`) plus `discoverySourceKey` when multiple directories are configured. **Heuristic-only** setups skip directory-derived picks unless an LLM path runs. The Skill Manager Catalog tab shows a non-installable summary row per directory; installs from listings use the Recommended flow. Singleton entries use `type: "official-skills" | "open-skills"` and `value: "directory"`. Persisted catalog cache **v6** drops legacy prefetched directory snapshots; LLM recommendation cache bumped to **v4**.

## 0.7.0

- **`owner/repo` source labels:** GitHub sources default to the full `owner/repo` (e.g. `keska-labs/skills`) instead of just the repo segment, so two repos with the same name from different owners no longer collide. `/` is preserved in the workspace layout, producing nested folders like `.cursor/rules/keska-labs/skills/<name>.mdc` that read naturally.
- **Recursive skill discovery:** GitHub sources are now scanned recursively across the entire repo — `SKILL.md` packages and `.mdc` rules are picked up at any depth, and `.md` / `.yaml` / `.yml` files are detected inside `rules/`, `skills/`, `.skills/`. Standard build/IDE/vendor folders are skipped (`.cursor/`, `node_modules/`, `dist/`, `build/`, `.git/`, `.github/`, `.venv/`, `.terraform/`, …) so the extension never re-imports a downstream consumer's synced files. Repos no longer need a fixed top-level layout.
- **Add-source UX:** the GitHub picker now leads with **"Enter owner/repo manually..."** so you can add any public or accessible private repo (e.g. `VoltAgent/awesome-agent-skills`) without it appearing in your own repo list. The custom-registry input also rejects `github.com` URLs and steers users to the GitHub source type instead.
- **Multi-source catalog:** configure any number of skill sources via the new `skillSync.sources` array — mix and match GitHub repositories and custom HTTPS registries. Catalogs from every source are fetched in parallel and merged into a single Skill Manager view. Per-source errors no longer block the rest of the catalog.
- **Per-skill source badges:** every row in Manage, Browse, Search, and Recommended now shows the originating source (label + type) so duplicate-named skills from different repos stay distinguishable.
- **Namespaced workspace layout:** synced files now land under `.cursor/rules/<source-label>/<name>.mdc` and `.cursor/skills/<source-label>/<name>/`. The label is auto-derived (repo segment for GitHub, hostname for registries) and can be overridden per source.
- **Automatic migrations:** existing single-source workspaces are migrated transparently on first activation — legacy `skillSync.sourceMode` / `sourceRepository` / `registryUrl` settings are folded into `skillSync.sources`, opted-in skill names are rewritten to `<label>/<name>` composite keys, and existing flat `.cursor/rules`/`.cursor/skills` files are moved into the new namespaced folder. The legacy keys remain readable for one release as a deprecated fallback.
- **New commands:** `Skill Sync: Add Skill Source` (guided picker) and `Skill Sync: Remove Skill Source`. The previous `Configure Source` command now appends instead of replacing.
- **Recommendations across sources:** the LLM recommendation cache key, prompt, and result payloads now include the source label so the model can disambiguate same-named skills, and the cache is keyed by the full set of configured sources.

## 0.6.0

- **Smart recommendations:** the Recommended tab tries LLM ranking in order (`vscode.lm` → Cursor SDK → OpenAI → Anthropic), then falls back to keyword/trigger heuristics. Results are TTL-cached per workspace; use **Refresh** to bypass cache. Optional commands store API keys in Secret Storage (`Skill Sync: Set … Recommendation Key`, **Clear Recommendation API Keys**). Settings live under `skillSync.recommendations.*`.
- **Ask the Agent:** opens Cursor chat with a context-rich prompt **pre-filled in the composer** via the `cursor://anysphere.cursor-deeplink/prompt` deeplink (the previous `executeCommand` path opened an empty chat). The prompt bakes in the workspace fingerprint (languages, dependencies, monorepo flag, AGENTS.md presence), the synced catalog candidates, and already-enabled skills, then asks the bundled **Cursor plugin** subagent (`agents/skill-recommender.md`) for grouped recommendations — press enter to submit or tweak first; no API key needed. The full prompt is also copied to the clipboard, and oversized catalogs are automatically trimmed to fit Cursor's deeplink size budget.
- **Catalog manifest:** sync and browse flows write `.cursor/skill-sync/catalog.json` (metadata only) for the plugin subagent and tooling.
- **Cursor plugin layout:** the bundled subagent lives at repo-root `agents/` beside `.cursor-plugin/plugin.json`, matching Cursor’s documented plugin structure (manifest in the dot-folder, agents as a sibling directory).

## 0.5.0

- **Recommended skills:** added a Recommended tab in Skill Manager that ranks relevant skills from workspace signals (languages, dependencies, path markers, installed extensions, and `AGENTS.md`) plus `metadata.triggers` scoring.
- **Browse selection in repository tree:** added checkbox-based selection in Browse so skills can be enabled directly from the tree view.
- **Selection behavior aligned with search:** Browse now differentiates skill packages and standalone rule files using the same model as catalog search (package folder vs single-file rule), while avoiding partial selection of files inside a detected skill package.

## 0.4.0

- **Plugin loading improvements:** startup and loading flow in the extension was refined for a more reliable first-run experience, including clearer handling around setup/welcome prompt states.
- **Browse tree fix:** directory expand/collapse behavior in the Browse tab was corrected so nested paths toggle consistently.

## 0.3.1

- **Removed telemetry:** optional Google Analytics / gtag and all extension-owned Skill Manager usage events are removed. Settings `skillSync.ga4MeasurementId` and `skillSync.ga4AllowWithoutProductTelemetry` are deleted. The webview CSP no longer allows Google domains.

## 0.3.0

- **Open standard: `SKILL.md`** — skill packages now follow the [agentskills.io](https://agentskills.io/specification) open format. A skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`, and an optional `metadata` block for `version` and `category`). This makes skills compatible with Cursor, Claude Code, GitHub Copilot, Gemini CLI, OpenAI Codex, and all other agents that implement the standard. Old `skill.json`-based repos are no longer detected; migrate to `SKILL.md`.
- **Bug fix — sync cleanup:** `disconnectSource` now removes both `.cursor/rules/*.mdc` files **and** `.cursor/skills/` packages; previously only rules were cleaned up on disconnect.
- **Bug fix — normalization:** skill package cleanup during sync now correctly normalises opted-in names before comparing against on-disk directory names, preventing packages from being accidentally deleted on every sync when their `SKILL.md` name contains spaces or capital letters.
- **Bug fix — browse root:** dedicated skill repositories (where SKILL.md packages live at the repo root) are now discovered correctly. Browse no longer incorrectly defaults to `.cursor/rules` for such repos; the resolution order is now repo root → `skills` → `.skills` → `rules` → `.cursor/rules`.
- **Cache:** storage version bumped to 3 (old cache is auto-invalidated on upgrade).

## 0.2.5

- **Skill packages:** repos can now include full directory-based skills (`skill.json` manifest + any supporting files) alongside existing single-file Cursor rules. Both types are discovered, cached, searched, and synced — rules go to `.cursor/rules/`, packages go to `.cursor/skills/<name>/`.
- **Manage tab:** "Enabled" renamed to **Manage** for clarity (you manage what's installed).
- **Browse tab:** now separate for repo exploration; directory entries in browse are tagged as potential skill packages.
- **Type badges:** each row in Manage and search results shows a cursor-rule or skill-package icon.
- **Search:** catalog search includes `category` field for broader matches.
- **Sync:** skill packages fetch all their files; cleanup removes both `.cursor/rules/*.mdc` and `.cursor/skills/` directories for opted-out items.
- **Repo discovery:** scans `.cursor/rules`, `rules`, `skills`, `.skills` in priority order.
- **Cache:** storage version bumped to 2 (old cache is auto-invalidated on upgrade).

## 0.2.1

- **Marketplace icon fix:** `media/icon.png` is now a proper **128×128** export from the full-frame **256×256** logo (replaces a Quick Look thumbnail that left the mark tiny in the listing tile).

## 0.2.0

- Marketplace description and docs emphasize **private GitHub repositories** (with sign-in) alongside custom registries.

## 0.1.1

- GitHub progressive browse, catalog cache, Enabled/Browse UI, and Skill Manager polish.

## 0.1.0

- Initial public functionality: GitHub and registry sources, sync into `.cursor/rules`, sidebar Skill Manager.
