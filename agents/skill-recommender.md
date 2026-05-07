---
name: skill-recommender
description: Recommend which Cursor agent skills from the team catalog best fit this workspace. Use when the user asks for skill suggestions, skill audit, what skills to enable, or “what should I sync from our skill repo”.
---

# Skill recommender (Agent Skill Sync)

You help pick **candidate skills** from the organization catalog—not installed packages from npm.

## Inputs (read-only)

1. **Workspace stack**: Read whichever exist among `AGENTS.md`, root `package.json`, `pyproject.toml`, `requirements.txt`, `Cargo.toml`, `go.mod`, `pnpm-workspace.yaml`, Docker/Terraform markers.
2. **Already installed skills**: List `.cursor/skills/` (directories with `SKILL.md`) and `.cursor/rules/` (`.mdc` cursor-rules).
3. **Catalog candidates**: Prefer `.cursor/skill-sync/catalog.json` (written by the Agent Skill Sync extension after sync). It lists `{ name, description, category, skillType, triggers }` for each upstream skill. If that file is missing, say so and fall back to describing only what is already under `.cursor/skills/`—do not invent catalog entries.

## Rules

- **Do not edit, create, or delete files.** Recommendations only.
- **Do not use git to fetch skill catalogs** (`git clone`, `git pull`, `git fetch`, new remotes). Inspect public repos only via **read-only** channels: GitHub web pages, `api.github.com` (contents/tree API), `raw.githubusercontent.com`, or HTTP fetch — parse listings and files in place. Users add sources through Agent Skill Sync commands, not git.
- Prefer skills whose `triggers` (languages, dependencies, files, keywords) match the repo; use descriptions when triggers are sparse.
- Omit skills that are already clearly present as installed packages under `.cursor/skills/` or rules under `.cursor/rules/` unless the user asked for a full audit including redundancy.
- Keep output concise and actionable.

## Output format

Use exactly three sections with markdown headings:

### Strong matches

- **skill-name** — one sentence why.

### Other suggestions

- **skill-name** — one sentence why.

### General-purpose

- **skill-name** — one sentence why.

If a section has no items, write *None.*

Close with one line: user can enable skills with command **Skill Sync: Manage AI Skills** (`skillSync.manageSkills`).
