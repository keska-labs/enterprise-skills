---
title: "We taught Agent Skill Sync to read the room"
slug: we-taught-agent-skill-sync-to-read-the-room
subtitle: "From pick-your-own to picked-for-you: a Recommended tab, LLM-powered ranking, and an Ask the Agent button that prefills your prompt."
tags: cursor, vscode, ai, developer-tools, open-source
---

> Quick recap from the [first post](https://blog.keska.io/we-shipped-a-cursor-plugin-to-make-enterprise-skills-repo-useful): **Agent Skill Sync** is a small VS Code / Cursor extension that pulls Cursor rules and skill packages from a GitHub repo (or a custom registry) and drops them where Cursor actually looks — `.cursor/rules` and `.cursor/skills`. Free on Open VSX: [KeskaLabsAB / agent-skill-sync](https://open-vsx.org/extension/KeskaLabsAB/agent-skill-sync).

The plugin we showed off in the last post nailed the boring half — getting curated skills out of git and into the editor without a copy-paste ceremony. Then the catalog grew. And the moment a teammate opened the panel, blinked at twenty-something skills, and asked “okay… which of these do I actually want?”, we knew the next problem to solve.

This post is about that. **Discovery.** Less scrolling, more “oh, that one.”

---

## First, the unsexy bit

Before we could put a recommender on top, the foundation had to behave. A quiet polish pass cleaned up two things you’ll notice mostly because they stopped annoying you:

- **First-run reliability** — the welcome / setup prompt no longer flickers, double-fires, or leaves you staring at a blank panel on a fresh install.
- **Browse tree expand/collapse** — nested folders now toggle the way you expect them to. Subtle, deeply annoying when it was wrong.

Onward.

---

## A Recommended tab, finally

We added a third tab to the Skill Manager — next to **Manage** and **Browse** — called **Recommended**. It looks at your workspace and ranks the catalog for you.

“Looks at your workspace” isn’t magic. It reads the ordinary tells:

- which **languages** the repo uses,
- what’s in `package.json` / `pyproject.toml` / `Cargo.toml` / `go.mod` (your **dependencies**),
- a few **path markers** (Dockerfiles, monorepo configs, etc.),
- which **VS Code / Cursor extensions** you have installed,
- and `AGENTS.md` if you keep one.

Each catalog skill can declare **`triggers`** in its `SKILL.md` (languages, dependencies, files, keywords). The tab cross-references the two and surfaces the matches with a small chip telling you *why* — “Keywords matched AGENTS.md [rest, api, endpoint],” that kind of thing. No surprises, no black box.

We also gave **Browse** a glow-up at the same time: every node in the repository tree got a checkbox, so you can enable a skill straight from the tree without round-tripping through Manage. Skill packages and standalone rules are correctly distinguished so you don’t accidentally toggle a single file inside a package.

![The Manage tab — your workspace’s currently enabled skills, with a SKILL.md open showing its triggers metadata.](https://raw.githubusercontent.com/keska-labs/enterprise-skills/main/media/preview-enabled.png)

> The Manage tab. Toggling a skill writes the whole package under `.cursor/skills/<name>/`. The `SKILL.md` on the right is what feeds the recommender — `triggers.dependencies`, `triggers.files`, `triggers.keywords`.

---

## Then we let an LLM rank them

Heuristic matching is great until the catalog gets opinionated and your repo gets messy. So the **Recommended tab now tries an LLM first** and only falls back to keyword matching if no model is available. The chain — in this exact order — is:

1. **`vscode.lm`** — VS Code’s Language Model API. If you have GitHub Copilot installed in VS Code, this is already wired up. (Heads up: Cursor doesn’t expose its built-in models through `vscode.lm` yet, so Cursor users land on step 2 or further.)
2. **Cursor SDK** — if you’ve set a key.
3. **OpenAI** — if you’ve set a key.
4. **Anthropic** — if you’ve set a key.
5. **Heuristic** — the original signal-matching logic. We label the result with a **HEURISTIC** badge so you’re never wondering which mode you’re in.

Keys are optional and stored in **VS Code Secret Storage**, not your `settings.json`. Set them with `Skill Sync: Set OpenAI Recommendation Key` (and friends), nuke them with `Clear Recommendation API Keys`. We don’t see them, we don’t want them.

Results are cached per-workspace with a TTL so the panel doesn’t hit a model every time you blink. Hit **Refresh** to bypass the cache when something obviously changed.

---

## Ask the Agent: keep the smart part inside Cursor

Now the part Cursor users will care about most.

If you don’t want to wire up an API key, **you don’t have to.** Click **Ask the Agent** and the extension does three things:

1. **Builds a context-rich prompt** — your workspace fingerprint (languages, deps, monorepo flag, AGENTS.md presence), the current synced **catalog candidates**, and the skills you’ve **already enabled**.
2. **Opens it pre-filled in Cursor’s composer**, via Cursor’s own [prompt deeplink](https://cursor.com/docs/reference/deeplinks). You see a *Create chat with prompt* sheet first — review, then **Create Chat**. (We also copy the same prompt to your clipboard, just in case.)
3. **Routes the request to a bundled subagent** — `agents/skill-recommender.md` — which is shipped with the repo as a [Cursor Plugin](https://cursor.com/docs/reference/plugins). Enable the plugin once and the subagent shows up like any other agent.

The result: no API key, no LLM cost, and the model that already lives inside Cursor (the one you’re paying for anyway) does the ranking — with the context that only the extension can collect.

![The Recommended tab on the left, with reason chips on each suggestion, and Cursor’s “Create chat with prompt” sheet on the right showing the prefilled prompt.](https://raw.githubusercontent.com/keska-labs/enterprise-skills/main/media/preview-recommended-ask-agent.png)

> Recommended on the left, **Ask the Agent** on the right. The prompt isn’t a one-liner — it includes the workspace fingerprint and the live catalog so the agent has something to reason about.

A small but important detail: oversized catalogs are automatically **trimmed to fit Cursor’s deeplink size budget**, so this doesn’t silently break on big skills repos.

---

## A new file you didn’t know you wanted: `catalog.json`

Whenever you sync or browse, the extension now writes a tiny manifest at:

```
.cursor/skill-sync/catalog.json
```

Metadata only — no skill bodies. It’s the file the bundled subagent (and any tooling you build on top) reads to know what’s actually in your team catalog right now. If you’ve ever wanted “the agent should know which skills are available without me copy-pasting,” this is that.

The plugin layout follows the [official Cursor plugin spec](https://cursor.com/docs/reference/plugins): manifest at `.cursor-plugin/plugin.json`, agent files in `agents/` next to it. Two paths because Cursor expects them in two places — not because we like extra folders.

---

## How to try it (the short path)

1. Install **Agent Skill Sync** (currently 0.6.0) from [Open VSX](https://open-vsx.org/extension/KeskaLabsAB/agent-skill-sync) — or the VS Code Marketplace.
2. Connect a skills repo (`owner/repo`) — yours, your team’s, or play with a public one.
3. Open the **Skills** sidebar (`Ctrl+Alt+S` / `Cmd+Alt+S`) and click the **Recommended** tab.
4. Either:
   - **Don’t configure anything** → you get heuristic ranking (badge says **HEURISTIC**), or
   - **Hit Ask the Agent** → Cursor’s composer opens with the prompt prefilled, no key needed (works best with the bundled `skill-recommender` plugin enabled), or
   - **Set a provider key** via `Skill Sync: Set … Recommendation Key` → ranking goes live with that model on every refresh.

Toggle what looks useful. Files land under `.cursor/rules` and `.cursor/skills` like before. Done.

---

## Why this matters more than “a new tab”

Curated skill repositories are starting to look a lot like internal package registries — versioned, reviewed, owned by the platform team. The next problem after “how do I get them into the editor” has always been: *which ones, for this codebase, today?*

We don’t think the answer is a longer onboarding doc. The answer is the editor noticing what you’re working on and saying so. The first cut of that is the dumb-but-honest version: signal matching with reason chips. The second cut hands the same context to a model — and if no model’s around, to your own Cursor agent in one click.

If something’s weird, [open an issue](https://github.com/keska-labs/enterprise-skills/issues). If it just works, enable a skill nobody on the team has tried yet and tell us if the ranking was right.

— Keska Labs
