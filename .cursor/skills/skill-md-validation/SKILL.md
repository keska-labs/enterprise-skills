---
name: skill-md-validation
description: >-
  Validates SKILL.md packages and cursor-rule files against what Agent Skill Sync indexes and syncs from GitHub.
  Use when changing RepoService catalog logic, SyncEngine package writes, or troubleshooting missing skills in the Skill Manager.
disable-model-invocation: true
---

# SKILL.md validation (GitHub source)

Official spec reference: [agentskills.io specification](https://agentskills.io/specification).

## What counts as a skill package

In [`RepoService.listSkillsInRepo`](src/services/RepoService.ts), a **skill package** is any directory under the resolved skills root that contains a blob path ending in **`SKILL.md`** (case-sensitive filename). All blobs under that directory are collected into `skillFiles` for sync.

## What counts as a cursor-rule

Standalone blobs under the skills root with extensions **`.md`, `.mdc`, `.yaml`, `.yml`** that are **not** inside a skill-package directory become `skillType: "cursor-rule"`.

## Frontmatter parsing

[`parseSkillMdFrontmatter`](src/services/RepoService.ts) reads the first YAML block between `---` lines. Supported subset:

- Top-level scalars: **`name`**, **`description`** (simple `key: value` lines).
- Nested **`metadata:`** block with **two-space-indented** keys (string values only)—used for **`version`** and **`category`** when present.

It does **not** load a full YAML parser; keep manifests within that subset or metadata may be ignored.

## Manifest → `SkillMeta`

From [`fetchSkillManifests`](src/services/RepoService.ts):

| Field | Source |
| --- | --- |
| `name` | Frontmatter `name`, else path-derived |
| `description` | Frontmatter `description` |
| `version` | `metadata.version`, else short SHA |
| `category` | `metadata.category`, else path-derived |
| `path` | Package directory path in repo |
| `skillType` | Always `"skill"` |
| `skillFiles` | All blob paths under the package dir |

## Workspace writes

[`SyncEngine.syncSkillPackage`](src/services/SyncEngine.ts) fetches each listed path and writes via [`writeSkillPackageFile`](src/utils/fileUtils.ts) under **`.cursor/skills/<normalized-name>/`**. Names are normalized with [`normalizeSkillName`](src/utils/fileUtils.ts) (lowercase, hyphen-safe).

Cursor-rules use **`writeSkillFile`** → **`.cursor/rules/<name>.mdc`**.

## Skills root resolution

[`RepoService`](src/services/RepoService.ts) picks the first existing candidate: repo root (if it looks like a skills root), then `skills`, `.skills`, `rules`, `.cursor/rules`.

## Custom registry note

[`RegistryService`](src/services/RegistryService.ts) currently maps API skills to **`cursor-rule`** only (single-file content). Package semantics apply to **GitHub** indexing unless registry support is extended.
