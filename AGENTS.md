# AGENTS.md — Agent Skill Sync

Instructions for AI coding agents working on **Agent Skill Sync** (`KeskaLabsAB.agent-skill-sync`). Human-facing docs live in [README.md](./README.md); this file adds **non-inferable** workflow and architecture constraints.

## Project at a glance

VS Code / Cursor extension that syncs **Cursor rules** and **skill packages** from a GitHub repo or a custom HTTP registry into the workspace under `.cursor/rules/` and `.cursor/skills/`. Two codebases in one repo:

| Layer | Location | Runtime |
| --- | --- | --- |
| Extension host | `src/` | Node (CommonJS), VS Code API ([webpack](./webpack.config.js) `target: "node"` → `dist/extension.js`) |
| Skill Manager UI | `webview-ui/` | Browser bundle (`target: "web"` → `dist/webview.js`), React 19 |

Entry: [`src/extension.ts`](./src/extension.ts). Configuration keys are under `skillSync.*` in [`package.json`](./package.json) `contributes.configuration`.

## Commands (prefer Task, fall back to npm)

If [Task](https://taskfile.dev) is installed, use [`Taskfile.yml`](./Taskfile.yml); otherwise use the equivalent `npm run` scripts.

| Goal | Task | npm |
| --- | --- | --- |
| Lint `src` + `webview-ui` | `task lint` | `npm run lint` |
| Unit tests (Jest + jsdom, `vscode` mocked) | `task test` | `npm test` |
| Extension-host tests | `task test-extension` | `npm run test:extension` |
| Production webpack | `task build` | `npm run build` |
| Full gate (clean, lint, test, build) | `task check` | `npm run check:release` |

**Before tagging or packaging a VSIX**, run `task check` (or `npm run check:release`). Extension-host tests need a GUI on some platforms; if they fail to launch locally, note that in the PR—CI/release still expects them to pass where Electron can run.

## Contribution loop

See [CONTRIBUTING.md](./CONTRIBUTING.md): fork, branch from `main`, `npm ci`, run lint + tests (or `task check`), one logical change per PR. For UI or activation/sync/browse behavior, describe what you tested (GitHub vs registry, sync, browse).

## Local install / dogfooding

1. `task vsix` — builds `agent-skill-sync-<version>.vsix` at repo root (`npx vsce package`; `vscode:prepublish` runs `check:release`).
2. `task install-vsix` — installs the newest local VSIX (`cursor` CLI preferred, else `code`).
3. `task verify-icon` — extracts `media/icon.png` from the latest VSIX for marketplace checks ([`scripts/verify-marketplace-icon.sh`](./scripts/verify-marketplace-icon.sh)).

## Release flow

1. Bump `version` in [`package.json`](./package.json) **and** add an entry to [`CHANGELOG.md`](./CHANGELOG.md) in the same change.
2. Push a git tag `v<version>`. [`.github/workflows/release.yml`](./github/workflows/release.yml) runs `npm ci`, `npm run vsix`, uploads the artifact, and attaches it to the GitHub Release.
3. Marketplace publish under publisher **KeskaLabsAB** is manual (`vsce publish`)—not automated in this workflow.

## Counterintuitive conventions

- **Dual webpack outputs**: Never import Node/`fs`/extension-only APIs from `webview-ui/`. The webview talks to the host only via `postMessage` ([`webview-ui/hooks/useVsCodeApi.ts`](./webview-ui/hooks/useVsCodeApi.ts) → `acquireVsCodeApi()`).
- **Shared message types**: `WebviewMessage` / `ExtensionMessage` / `SkillManagerState` live in [`webview-ui/types/messages.ts`](./webview-ui/types/messages.ts); extension panels import from there. Extend the discriminated union and handle it in **both** [`SkillManagerSidebarProvider`](./src/panels/SkillManagerSidebarProvider.ts) and [`SkillManagerPanel`](./src/panels/SkillManagerPanel.ts).
- **Two test runners**: Jest for unit/UI component tests ([`jest.config.js`](./jest.config.js) maps `vscode` → [`src/test/vscodeMock.ts`](./src/test/vscodeMock.ts)); Mocha via `@vscode/test-electron` under [`src/test/suite/`](./src/test/suite/) ([`src/test/runExtensionTests.ts`](./src/test/runExtensionTests.ts)). Do not mix frameworks in one file.
- **Skill kinds**: `SkillType` in [`src/types.ts`](./src/types.ts)—`cursor-rule` (single file → `.cursor/rules/<name>.mdc`) vs `skill` (directory with `SKILL.md` marker → `.cursor/skills/<name>/`). [`SyncEngine`](./src/services/SyncEngine.ts) branches on `meta.skillType`.
- **`activate` is idempotent** ([`src/extension.ts`](./src/extension.ts)); do not assume multiple activations.
- **No `vs/nls`**: User-visible strings are English only (not VS Code core).
- **Style**: Match existing code—2 spaces, double quotes, semicolons; prefer explicit types on exports; `@typescript-eslint/no-explicit-any` is off but avoid `any` anyway ([`.eslintrc.cjs`](./.eslintrc.cjs)).

## Do not touch

- Generated or vendored trees: `dist/`, `coverage/`, `node_modules/`, committed `*.vsix` in the repo root (do not check in new VSIX artifacts).
- Do not change workspace sync targets: extension output stays under `.cursor/rules/` and `.cursor/skills/` only ([`SyncEngine`](./src/services/SyncEngine.ts) / [`fileUtils`](./src/utils/fileUtils.ts)).
- Version bumps without `CHANGELOG.md` updates (see Release flow).

## Scoped agent rules & skills (this repo)

Cursor loads **project rules** from `.cursor/rules/*.mdc` (path globs) and **skills** from `.cursor/skills/<name>/SKILL.md`:

| Path | Purpose |
| --- | --- |
| `.cursor/rules/extension-host.mdc` | Extension host services, DI, disposables |
| `.cursor/rules/webview-ui.mdc` | React webview, messaging, no Node APIs |
| `.cursor/rules/tests.mdc` | Jest vs extension-host tests |
| `.cursor/skills/webview-bridge/` | Add or change webview ↔ host messages |
| `.cursor/skills/extension-test-patterns/` | Testing strategy and mocks |
| `.cursor/skills/skill-md-validation/` | `SKILL.md` / agentskills.io alignment with `RepoService` |
| `.cursor/skills/add-skill-source/` | Adding a third sync source mode |

Invoke a skill by name in Cursor when the task matches its description.
