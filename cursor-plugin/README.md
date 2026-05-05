# Cursor plugin: Agent Skill Sync recommender

This repository ships a **Cursor plugin** alongside the VS Code extension. The plugin contributes a **subagent** that ranks skills from your synced catalog against the open workspace.

## Layout

- `.cursor-plugin/plugin.json` — manifest ([reference](https://cursor.com/docs/reference/plugins))
- `cursor-plugin/agents/skill-recommender.md` — subagent definition

## Prerequisites

1. Install the **Agent Skill Sync** extension and configure a GitHub or registry source.
2. Run **Skill Sync: Sync Now** (or enable skills) so the extension writes `.cursor/skill-sync/catalog.json` with catalog metadata.

## Try locally

Point Cursor at this repo or symlink the plugin folder per [Plugins reference](https://cursor.com/docs/reference/plugins). Open chat and ask e.g. *“Recommend Cursor skills for this repo”*.

## Publish to the Marketplace

1. Ensure `.cursor-plugin/plugin.json` has a unique `name`, correct `version`, and committed assets.
2. Open [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) and submit your Git repository URL.
3. Follow the submission checklist in the official docs.

Publishing is manual (same idea as VSIX for the extension).
