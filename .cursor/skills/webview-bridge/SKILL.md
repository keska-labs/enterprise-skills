---
name: webview-bridge
description: >-
  Adds or changes messages between the Skill Manager React webview and the extension host.
  Use when extending WebviewMessage/ExtensionMessage, wiring postMessage handlers, or
  debugging SkillManagerSidebarProvider / SkillManagerPanel message flows.
disable-model-invocation: true
---

# Webview ↔ extension host bridge

## Architecture

- **Types**: [`webview-ui/types/messages.ts`](webview-ui/types/messages.ts) defines `WebviewMessage` (webview → host), `ExtensionMessage` (host → webview), and `SkillManagerState`.
- **Webview**: [`webview-ui/hooks/useVsCodeApi.ts`](webview-ui/hooks/useVsCodeApi.ts) exposes `acquireVsCodeApi()`; call `postMessage(payload)` with a `WebviewMessage` object.
- **Host**: Two providers mirror the same `handleMessage` switch:
  - [`src/panels/SkillManagerSidebarProvider.ts`](src/panels/SkillManagerSidebarProvider.ts)
  - [`src/panels/SkillManagerPanel.ts`](src/panels/SkillManagerPanel.ts)

Errors in handlers are caught, logged, and surfaced as `{ type: "error", message: string }` to the webview.

## Workflow: add a new webview → host message

1. **Extend the union** in `webview-ui/types/messages.ts`:

   ```ts
   export type WebviewMessage =
     | { type: "ready" }
     // ...
     | { type: "yourAction"; foo: string };
   ```

2. **Handle it in both panels** — add a `case` in `handleMessage` in `SkillManagerSidebarProvider` and `SkillManagerPanel` (keep them in sync). Pattern from the sidebar:

```67:132:src/panels/SkillManagerSidebarProvider.ts
  private async handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case "ready":
      case "getState":
        await this.postState();
        break;
      case "searchCatalog": {
        await handleGithubSearchCatalog(
          this.configService,
          this.repoService,
          this.catalogStore,
          message.query,
          (msg) => this.view?.webview.postMessage(msg)
        );
        await this.postState();
        break;
      }
    }
  }
```

3. **Send from React**: `useVsCodeApi().postMessage({ type: "yourAction", foo: "bar" })`.

4. **Host → webview**: If the UI needs new push updates, extend `ExtensionMessage` and post from the host with `webview.postMessage(...)`. Existing examples: `setState`, `syncComplete`, `browseUpdate`, `catalogSearchResults`, `error`.

## Testing

- Extend [`src/test/vscodeMock.ts`](src/test/vscodeMock.ts) if Jest tests need new `vscode.window` or webview behavior.
- For full integration, add or extend tests under [`src/test/suite/`](src/test/suite/).

## Additional resources

- HTML bootstrap for the webview: [`src/utils/skillManagerWebviewHtml.ts`](src/utils/skillManagerWebviewHtml.ts)
