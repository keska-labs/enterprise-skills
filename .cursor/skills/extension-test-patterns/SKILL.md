---
name: extension-test-patterns
description: >-
  Chooses between Jest unit tests and @vscode/test-electron extension-host tests for Agent Skill Sync.
  Use when adding tests for services, webview components, or extension activation/webview integration.
disable-model-invocation: true
---

# Extension test patterns

## Two runners

| Runner | Entry | Use for |
| --- | --- | --- |
| **Jest** | `npm test` / `task test` | Services, utilities, React components (jsdom) |
| **@vscode/test-electron** | `npm run test:extension` / `task test-extension` | Real Extension Host: activation, commands, webviews |

## Jest configuration

[`jest.config.js`](jest.config.js):

- **`vscode` mock**: `"^vscode$": "<rootDir>/src/test/vscodeMock.ts"` — extension code importing `vscode` gets the mock automatically.
- **CSS mock**: maps to [`src/test/styleMock.ts`](src/test/styleMock.ts).
- **`src/test/suite/` excluded** — those files are Mocha suites for the extension host, not Jest.

Setup: [`src/test/setupTests.ts`](src/test/setupTests.ts) pulls in `@testing-library/jest-dom`.

## Extension-host runner

[`src/test/runExtensionTests.ts`](src/test/runExtensionTests.ts) resolves the repo root and loads [`src/test/suite/index`](src/test/suite/index). Use this path when debugging “tests pass in Jest but fail in real VS Code.”

## When to extend `vscodeMock`

Prefer updating [`src/test/vscodeMock.ts`](src/test/vscodeMock.ts) when multiple tests need the same API surface (e.g. new `workspace.fs` behavior). Keeps mocks consistent and avoids duplicated `jest.mock` blocks.

## Quick checklist for new code

- **Pure logic / axios / parsers** → Jest file next to source or under `src/test/*.test.ts`.
- **React presentational / hooks with injected API** → Jest + Testing Library in `webview-ui/*.test.tsx`.
- **End-to-end extension behavior** → `src/test/suite/`.

## Commands

```bash
task test              # or npm test
task test-extension    # or npm run test:extension
task check             # full gate before release
```
