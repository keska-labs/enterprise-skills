# Changelog

## 0.3.0

- **Open standard: `SKILL.md`** — skill packages now follow the [agentskills.io](https://agentskills.io/specification) open format. A skill is a directory containing a `SKILL.md` file with YAML frontmatter (`name`, `description`, and an optional `metadata` block for `version` and `category`). This makes skills compatible with Cursor, Claude Code, GitHub Copilot, Gemini CLI, OpenAI Codex, and all other agents that implement the standard. Old `skill.json`-based repos are no longer detected; migrate to `SKILL.md`.
- **Bug fix — sync cleanup:** `disconnectSource` now removes both `.cursor/rules/*.mdc` files **and** `.cursor/skills/` packages; previously only rules were cleaned up on disconnect.
- **Bug fix — normalization:** skill package cleanup during sync now correctly normalises opted-in names before comparing against on-disk directory names, preventing packages from being accidentally deleted on every sync when their `SKILL.md` name contains spaces or capital letters.
- **Bug fix — duplicate analytics event:** switching to the Manage tab no longer fires `skill_manager_tab` twice.
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

## 0.2.4

- **GA4:** Setting `skillSync.ga4AllowWithoutProductTelemetry` (default `false`) lets your Measurement ID load when editor product telemetry is off—fixes common “nothing in GA” setups (e.g. Cursor). One-time **Output → Agent Skill Sync** warning when a valid `G-...` is blocked by telemetry. `skillSync.ga4MeasurementId` default is empty again (was incorrectly non-empty). CSP `connect-src` widened slightly for regional GA endpoints; gtag `error` logs to the webview console.

## 0.2.3

- **GA4:** Respects product telemetry (`vscode.env.isTelemetryEnabled`); no measurement ID is applied in the webview when telemetry is off. Richer anonymized events (session context, sync/browse/catalog interactions, length buckets and counts only—no repo, paths, skill names, or query text).

## 0.2.2

- Optional **Google Analytics 4** in the Skill Manager webview: setting `skillSync.ga4MeasurementId` (`G-...`). Off by default; CSP updated for `googletagmanager.com` / `google-analytics.com` when enabled.

## 0.2.1

- **Marketplace icon fix:** `media/icon.png` is now a proper **128×128** export from the full-frame **256×256** logo (replaces a Quick Look thumbnail that left the mark tiny in the listing tile).

## 0.2.0

- Marketplace description and docs emphasize **private GitHub repositories** (with sign-in) alongside custom registries.

## 0.1.1

- GitHub progressive browse, catalog cache, Enabled/Browse UI, and Skill Manager polish.

## 0.1.0

- Initial public functionality: GitHub and registry sources, sync into `.cursor/rules`, sidebar Skill Manager.
