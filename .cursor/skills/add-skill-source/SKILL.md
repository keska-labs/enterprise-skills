---
name: add-skill-source
description: >-
  Adds a third skill source mode beside GitHub repo and custom registry for Agent Skill Sync.
  Use when extending SourceMode, ConfigService, SyncEngine branching, or marketplace settings schema.
disable-model-invocation: true
---

# Add a skill source mode

Today the extension supports:

| Mode | Config | Listing | Content |
| --- | --- | --- | --- |
| `github-repo` | `skillSync.sourceRepository` | [`RepoService.listSkillsInRepo`](src/services/RepoService.ts) | [`RepoService.getSkillContent`](src/services/RepoService.ts) |
| `custom-registry` | `skillSync.registryUrl` | [`RegistryService.listSkills`](src/services/RegistryService.ts) | [`RegistryService.getSkillContent`](src/services/RegistryService.ts) |

[`SyncEngine.sync`](src/services/SyncEngine.ts) branches on `configService.getSourceMode()`:

```96:120:src/services/SyncEngine.ts
      const skillIndex = sourceMode === "github-repo"
        ? await this.getGithubSkills()
        : await this.registryService.listSkills();

      const indexByName = new Map(skillIndex.map((skill) => [skill.name, skill]));

      for (const skillName of optedInSkills) {
        const meta = indexByName.get(skillName);
        // ...
            const content = sourceMode === "github-repo"
              ? await this.getGithubSkillContent(meta.path)
              : await this.registryService.getSkillContent(meta.path);
```

## Checklist for a new `SourceMode`

1. **Types** — Extend [`SourceMode`](src/types.ts) and [`SkillManagerState["sourceMode"]`](webview-ui/types/messages.ts) if the UI exposes the mode.

2. **Settings** — Add enum value + any new keys under `contributes.configuration.properties` in [`package.json`](package.json) (`skillSync.sourceMode`, plus URLs or IDs).

3. **ConfigService** — [`getSourceMode`](src/services/ConfigService.ts), `setSourceMode`, and **`isSourceConfigured()`** must know how to detect a valid configuration for the new mode.

4. **Service** — Implement a class (or extend an existing one) that can produce `SkillMeta[]` for the catalog and `SkillContent` (or package file fetches) compatible with [`SyncEngine`](src/services/SyncEngine.ts):

   - For **packages**, set `skillType: "skill"`, `path` to the package root identifier, and populate `skillFiles` with every file path the engine should download.
   - For **single-file rules**, use `skillType: "cursor-rule"` and a stable `path`/`shaOrVersion`.

5. **SyncEngine** — Replace the binary `github-repo` ternary with a `switch` or strategy map; route `syncSkillPackage` vs `writeSkillFile` exactly like today.

6. **Auth** — [`AuthService`](src/services/AuthService.ts) is GitHub-oriented; if the new backend uses another credential model, thread tokens through the new service without breaking existing modes.

7. **UX** — [`configureSource`](src/commands/registerCommands.ts) is GitHub-repo-specific today; add prompts or quick-picks for the new mode, and ensure [`skillManagerState`](src/panels/skillManagerState.ts) / webview tabs reflect connection health.

8. **Extension bootstrap** — Construct the new service in [`src/extension.ts`](src/extension.ts), pass it into `SyncEngine`, panels, and tests.

9. **Tests** — Add Jest coverage for the new service and extend [`SyncEngine.test.ts`](src/test/SyncEngine.test.ts) (or equivalent) for the new branch.

## Registry limitation (today)

[`RegistryService.listSkills`](src/services/RegistryService.ts) marks every skill as `skillType: "cursor-rule"`. Full package support for a registry requires API shape changes and SyncEngine handling analogous to GitHub trees.
