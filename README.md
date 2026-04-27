# Agent Skill Sync

VS Code extension that syncs agent skill files from a **GitHub repository** or a **custom registry** into your workspace under `.cursor/rules`.

## Features

- Connect a repo that hosts `.cursor/rules` (or `skills` / `.skills`), browse folders progressively, search the catalog, and enable skills per workspace.
- Optional custom registry mode with category-based listing.
- GitHub authentication via the built-in GitHub provider (`read:org`, `repo` for private repositories).
- Cached catalog metadata in global storage to keep the UI responsive and reduce API calls.

## Requirements

- VS Code **1.85** or compatible (Cursor included).
- For GitHub sources: sign in with GitHub when prompted.

## Development

```bash
npm ci
npm run lint
npm test
npm run build
```

The packaged extension loads `dist/extension.js` and `dist/webview.js`. Source lives under `src/` and `webview-ui/`.

### Extension integration tests

Runs a real VS Code instance (slower, needs a display on Linux CI unless configured):

```bash
npm run test:extension
```

## Packaging a `.vsix`

```bash
npm install -g @vscode/vsce
npm run build
vsce package
```

Before publishing to the [Marketplace](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) or [Open VSX](https://github.com/eclipse/openvsx), set `publisher` in `package.json` to **your** publisher id and add a `repository` URL so users can report issues.

## Configuration

| Key | Description |
| --- | --- |
| `skillSync.sourceMode` | `github-repo` or `custom-registry` |
| `skillSync.sourceRepository` | `owner/repo` for GitHub |
| `skillSync.registryUrl` | Base URL for custom registry |
| `skillSync.categories` | Registry category names |
| `skillSync.optedInSkills` | Skill names enabled for sync |

## Privacy

GitHub API calls use your signed-in session token. Skill content is fetched only for skills you enable and is written under `.cursor/rules` in the workspace. Review [GitHub’s terms](https://docs.github.com/en/site-policy) for API use.

## License

MIT — see [LICENSE](./LICENSE).
