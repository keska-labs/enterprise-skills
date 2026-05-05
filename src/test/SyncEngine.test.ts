import * as vscode from "vscode";
import { SyncEngine } from "../services/SyncEngine";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { RepoService } from "../services/RepoService";
import { RegistryService } from "../services/RegistryService";
import { Logger } from "../utils/logger";
import * as fileUtils from "../utils/fileUtils";
import { ServiceError } from "../services/ServiceError";
import { SkillCatalogStore } from "../services/SkillCatalogStore";

describe("SyncEngine", () => {
  it("syncs opted-in skills from GitHub source", async () => {
    jest.spyOn(fileUtils, "writeSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "deleteSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);

    const auth = { getToken: jest.fn().mockResolvedValue("token") } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue(["skill-a"]),
      getSourceMode: jest.fn().mockReturnValue("github-repo"),
      getSourceRepository: jest.fn().mockReturnValue("owner/repo"),
      getRegistryUrl: jest.fn().mockReturnValue(""),
      isSourceConfigured: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const repo = {
      listSkillsInRepo: jest.fn().mockResolvedValue([{ name: "skill-a", path: "skills/skill-a.mdc", shaOrVersion: "abc1234" }]),
      getSkillContent: jest.fn().mockResolvedValue({ content: "body", shaOrVersion: "abc1234" }),
      resolveSkillsRootPath: jest.fn().mockResolvedValue(".cursor/rules")
    } as unknown as RepoService;
    const registry = {} as RegistryService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogStore = {
      load: jest.fn().mockReturnValue(undefined),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;

    const engine = new SyncEngine(auth, config, repo, registry, logger, catalogStore);
    const result = await engine.sync(true);
    expect(result.status).toBe("success");
    expect(result.updated).toContain("skill-a");
  });

  it("returns skipped result when no session exists", async () => {
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);
    const auth = { getToken: jest.fn().mockResolvedValue(undefined) } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue([]),
      getSourceMode: jest.fn().mockReturnValue("github-repo"),
      getSourceRepository: jest.fn().mockReturnValue("owner/repo"),
      getRegistryUrl: jest.fn().mockReturnValue(""),
      isSourceConfigured: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const repo = {} as RepoService;
    const registry = {} as RegistryService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogStore = {} as SkillCatalogStore;

    const engine = new SyncEngine(auth, config, repo, registry, logger, catalogStore);
    const result = await engine.sync(false);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_session");
  });

  it("returns auth_expired for service auth errors", async () => {
    const auth = {
      getToken: jest.fn().mockRejectedValue(new ServiceError("auth_expired", "GitHub authorization expired."))
    } as unknown as AuthService;
    const config = {
      isSourceConfigured: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const repo = {} as RepoService;
    const registry = {} as RegistryService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogStore = {} as SkillCatalogStore;

    const engine = new SyncEngine(auth, config, repo, registry, logger, catalogStore);
    const result = await engine.sync(true);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("auth_expired");
  });

  it("skips background sync without auth or warning when source is not configured", async () => {
    const auth = { getToken: jest.fn() } as unknown as AuthService;
    const config = {
      isSourceConfigured: jest.fn().mockReturnValue(false)
    } as unknown as ConfigService;
    const repo = {} as RepoService;
    const registry = {} as RegistryService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogStore = {} as SkillCatalogStore;
    (vscode.window.showWarningMessage as jest.Mock).mockClear();
    const showWarning = jest.spyOn(vscode.window, "showWarningMessage");

    const engine = new SyncEngine(auth, config, repo, registry, logger, catalogStore);
    const result = await engine.sync(false);

    expect(auth.getToken).not.toHaveBeenCalled();
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("source_invalid");
    expect(showWarning).not.toHaveBeenCalled();
    showWarning.mockRestore();
  });

  it("refreshes incomplete cached skill-package metadata before syncing", async () => {
    jest.spyOn(fileUtils, "writeSkillPackageFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);
    jest.spyOn(fileUtils, "listExistingSkillPackages").mockResolvedValue([]);
    jest.spyOn(fileUtils, "deleteSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "deleteSkillPackage").mockResolvedValue(undefined);

    const auth = { getToken: jest.fn().mockResolvedValue("token") } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue(["api-documentation"]),
      getSourceMode: jest.fn().mockReturnValue("github-repo"),
      getSourceRepository: jest.fn().mockReturnValue("owner/repo"),
      getRegistryUrl: jest.fn().mockReturnValue(""),
      isSourceConfigured: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const repo = {
      listSkillsInRepo: jest.fn().mockResolvedValue([
        {
          name: "api-documentation",
          path: "skills/api-documentation",
          shaOrVersion: "abc1234",
          skillType: "skill",
          skillFiles: ["skills/api-documentation/SKILL.md"]
        }
      ]),
      getSkillContent: jest.fn().mockResolvedValue({ content: "manifest", shaOrVersion: "abc1234" }),
      resolveSkillsRootPath: jest.fn().mockResolvedValue("skills")
    } as unknown as RepoService;
    const registry = {} as RegistryService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogStore = {
      load: jest.fn().mockReturnValue({
        skillsRoot: "skills",
        metas: [
          {
            name: "api-documentation",
            path: "skills/api-documentation",
            shaOrVersion: "stale000",
            skillType: "skill"
          }
        ]
      }),
      save: jest.fn(),
      merge: jest.fn(),
      clear: jest.fn()
    } as unknown as SkillCatalogStore;

    const engine = new SyncEngine(auth, config, repo, registry, logger, catalogStore);
    const result = await engine.sync(true);

    expect(repo.listSkillsInRepo).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
    expect(result.updated).toContain("api-documentation");
  });
});
