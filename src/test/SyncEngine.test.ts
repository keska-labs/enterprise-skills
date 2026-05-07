import * as vscode from "vscode";
import { SyncEngine } from "../services/SyncEngine";
import { AuthService } from "../services/AuthService";
import { ConfigService } from "../services/ConfigService";
import { Logger } from "../utils/logger";
import * as fileUtils from "../utils/fileUtils";
import { ServiceError } from "../services/ServiceError";
import { CatalogService } from "../services/CatalogService";
import { MultiSourceCatalogService } from "../services/MultiSourceCatalogService";
import { ResolvedSource, SkillMeta } from "../types";
import { compositeSkillKey } from "../utils/sources";

function makeSource(label = "repo"): ResolvedSource {
  return {
    type: "github-repo",
    value: `owner/${label}`,
    label,
    sourceKey: `github:owner/${label}`
  };
}

function makeMultiSourceService(metas: SkillMeta[], sources: ResolvedSource[]): MultiSourceCatalogService {
  const byCompositeKey = new Map<string, SkillMeta>();
  const stamped = metas.map((meta) => {
    const source = sources[0];
    const stampedMeta: SkillMeta = {
      ...meta,
      source: { type: source.type, value: source.value, label: source.label, sourceKey: source.sourceKey }
    };
    byCompositeKey.set(compositeSkillKey(source.label, meta.name), stampedMeta);
    return stampedMeta;
  });
  return {
    getMergedCatalog: jest.fn().mockResolvedValue({
      metas: stamped,
      perSource: sources.map((s) => ({ source: s, snapshot: { skillsRoot: "skills", metas: stamped } })),
      byCompositeKey
    })
  } as unknown as MultiSourceCatalogService;
}

describe("SyncEngine", () => {
  it("syncs opted-in skills from GitHub source", async () => {
    jest.spyOn(fileUtils, "writeSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "deleteSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);
    jest.spyOn(fileUtils, "listExistingSkillPackages").mockResolvedValue([]);

    const sources = [makeSource("repo")];
    const auth = { getToken: jest.fn().mockResolvedValue("token") } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue([compositeSkillKey("repo", "skill-a")]),
      getResolvedSources: jest.fn().mockReturnValue(sources),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogService = {
      getContent: jest.fn().mockResolvedValue({ content: "body", shaOrVersion: "abc1234" })
    } as unknown as CatalogService;
    const multi = makeMultiSourceService(
      [{ name: "skill-a", path: "skills/skill-a.mdc", shaOrVersion: "abc1234", skillType: "cursor-rule" }],
      sources
    );

    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
    const result = await engine.sync(true);
    expect(result.status).toBe("success");
    expect(result.updated).toContain(compositeSkillKey("repo", "skill-a"));
  });

  it("does not fetch content for discovery-only opted-in skills", async () => {
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);
    jest.spyOn(fileUtils, "listExistingSkillPackages").mockResolvedValue([]);

    const aggLabel = "officialskills-sh";
    const aggSource: ResolvedSource = {
      type: "official-skills",
      value: "directory",
      label: aggLabel,
      sourceKey: "official-skills:directory"
    };
    const sources = [aggSource];
    const auth = { getToken: jest.fn().mockResolvedValue("token") } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue([compositeSkillKey(aggLabel, "docx")]),
      getResolvedSources: jest.fn().mockReturnValue(sources),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const getContent = jest.fn();
    const catalogService = { getContent } as unknown as CatalogService;
    const discoveryMeta: SkillMeta = {
      name: "docx",
      shaOrVersion: "readme",
      skillType: "skill",
      isDiscoveryOnly: true,
      installSourceRef: { type: "github-repo", value: "anthropics/skills", skillPath: "skills/docx" }
    };
    const multi = makeMultiSourceService([discoveryMeta], sources);

    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
    const result = await engine.sync(true);
    expect(getContent).not.toHaveBeenCalled();
    expect(result.errors.some((e) => e.includes("discovery-only"))).toBe(true);
  });

  it("returns skipped result when no session exists", async () => {
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);
    const auth = { getToken: jest.fn().mockResolvedValue(undefined) } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue([]),
      getResolvedSources: jest.fn().mockReturnValue([makeSource()]),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogService = {} as CatalogService;
    const multi = {} as MultiSourceCatalogService;

    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
    const result = await engine.sync(false);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_session");
  });

  it("returns auth_expired for service auth errors", async () => {
    const auth = {
      getToken: jest.fn().mockRejectedValue(new ServiceError("auth_expired", "GitHub authorization expired."))
    } as unknown as AuthService;
    const config = {
      getResolvedSources: jest.fn().mockReturnValue([makeSource()]),
      getOptedInSkills: jest.fn().mockReturnValue([]),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogService = {} as CatalogService;
    const multi = {} as MultiSourceCatalogService;

    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
    const result = await engine.sync(true);
    expect(result.status).toBe("failed");
    expect(result.reason).toBe("auth_expired");
  });

  it("skips background sync without auth or warning when source is not configured", async () => {
    const auth = { getToken: jest.fn() } as unknown as AuthService;
    const config = {
      getResolvedSources: jest.fn().mockReturnValue([]),
      getOptedInSkills: jest.fn().mockReturnValue([]),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(false)
    } as unknown as ConfigService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const catalogService = {} as CatalogService;
    const multi = {} as MultiSourceCatalogService;
    (vscode.window.showWarningMessage as jest.Mock).mockClear();
    const showWarning = jest.spyOn(vscode.window, "showWarningMessage");

    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
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

    const sources = [makeSource("repo")];
    const auth = { getToken: jest.fn().mockResolvedValue("token") } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue([compositeSkillKey("repo", "api-documentation")]),
      getResolvedSources: jest.fn().mockReturnValue(sources),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const catalogService = {
      getContent: jest.fn().mockResolvedValue({ content: "manifest", shaOrVersion: "abc1234" })
    } as unknown as CatalogService;
    const multi = makeMultiSourceService(
      [
        {
          name: "api-documentation",
          path: "skills/api-documentation",
          shaOrVersion: "abc1234",
          skillType: "skill",
          skillFiles: ["skills/api-documentation/SKILL.md"]
        }
      ],
      sources
    );
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;

    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
    const result = await engine.sync(true);

    expect(multi.getMergedCatalog).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
    expect(result.updated).toContain(compositeSkillKey("repo", "api-documentation"));
  });

  it("dedupes repeated manual syncs by source-scoped SHA cache", async () => {
    jest.spyOn(fileUtils, "writeSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);
    jest.spyOn(fileUtils, "listExistingSkillPackages").mockResolvedValue([]);
    jest.spyOn(fileUtils, "deleteSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "deleteSkillPackage").mockResolvedValue(undefined);

    const sources = [makeSource("repo")];
    const auth = { getToken: jest.fn().mockResolvedValue("token") } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue([compositeSkillKey("repo", "skill-a")]),
      getResolvedSources: jest.fn().mockReturnValue(sources),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const catalogService = {
      getContent: jest.fn().mockResolvedValue({ content: "body", shaOrVersion: "abc1234" })
    } as unknown as CatalogService;
    const multi = makeMultiSourceService(
      [{ name: "skill-a", path: "skills/skill-a.mdc", shaOrVersion: "abc1234", skillType: "cursor-rule" }],
      sources
    );
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;

    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
    await engine.sync(true);
    await engine.sync(true);

    expect(catalogService.getContent).toHaveBeenCalledTimes(1);
  });

  it("populates staleSources when a source serves cached catalog and keeps status success", async () => {
    jest.spyOn(fileUtils, "writeSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);
    jest.spyOn(fileUtils, "listExistingSkillPackages").mockResolvedValue([]);
    jest.spyOn(fileUtils, "deleteSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "deleteSkillPackage").mockResolvedValue(undefined);

    const sources = [makeSource("repo")];
    const auth = { getToken: jest.fn().mockResolvedValue("token") } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue([compositeSkillKey("repo", "skill-a")]),
      getResolvedSources: jest.fn().mockReturnValue(sources),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const catalogService = {
      getContent: jest.fn().mockResolvedValue({ content: "body", shaOrVersion: "abc1234" })
    } as unknown as CatalogService;

    const stamped: SkillMeta = {
      name: "skill-a",
      path: "skills/skill-a.mdc",
      shaOrVersion: "abc1234",
      skillType: "cursor-rule",
      source: { type: sources[0].type, value: sources[0].value, label: sources[0].label, sourceKey: sources[0].sourceKey }
    };
    const retryAt = new Date("2030-01-01T00:00:00Z").toISOString();
    const multi = {
      getMergedCatalog: jest.fn().mockResolvedValue({
        metas: [stamped],
        perSource: [
          {
            source: sources[0],
            snapshot: {
              skillsRoot: "skills",
              metas: [stamped],
              isStale: true,
              staleReason: "rate_limited",
              retryAt
            },
            stale: true,
            staleReason: "rate_limited",
            retryAt
          }
        ],
        byCompositeKey: new Map([[compositeSkillKey("repo", "skill-a"), stamped]])
      })
    } as unknown as MultiSourceCatalogService;
    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;

    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
    const result = await engine.sync(true);

    expect(result.status).toBe("success");
    expect(result.staleSources).toHaveLength(1);
    expect(result.staleSources[0]).toEqual({
      label: "repo",
      reason: "rate_limited",
      retryAt
    });
  });

  it("dispatches per-source content fetches and writes namespaced files for multi-source", async () => {
    const writeFile = jest.spyOn(fileUtils, "writeSkillFile").mockResolvedValue(undefined);
    jest.spyOn(fileUtils, "listExistingSkillFiles").mockResolvedValue([]);
    jest.spyOn(fileUtils, "listExistingSkillPackages").mockResolvedValue([]);

    const sourceA: ResolvedSource = { type: "github-repo", value: "owner/a", label: "a", sourceKey: "github:owner/a" };
    const sourceB: ResolvedSource = { type: "github-repo", value: "owner/b", label: "b", sourceKey: "github:owner/b" };

    const metaA: SkillMeta = {
      name: "shared",
      path: "skills/shared.mdc",
      shaOrVersion: "aaa",
      skillType: "cursor-rule",
      source: { type: sourceA.type, value: sourceA.value, label: sourceA.label, sourceKey: sourceA.sourceKey }
    };
    const metaB: SkillMeta = {
      name: "shared",
      path: "skills/shared.mdc",
      shaOrVersion: "bbb",
      skillType: "cursor-rule",
      source: { type: sourceB.type, value: sourceB.value, label: sourceB.label, sourceKey: sourceB.sourceKey }
    };
    const byCompositeKey = new Map<string, SkillMeta>([
      ["a/shared", metaA],
      ["b/shared", metaB]
    ]);

    const auth = { getToken: jest.fn().mockResolvedValue("token") } as unknown as AuthService;
    const config = {
      getOptedInSkills: jest.fn().mockReturnValue(["a/shared", "b/shared"]),
      getResolvedSources: jest.fn().mockReturnValue([sourceA, sourceB]),
      hasAnyConfiguredSource: jest.fn().mockReturnValue(true)
    } as unknown as ConfigService;
    const catalogService = {
      getContent: jest.fn().mockImplementation(async (key: string) => ({ content: `body-${key}`, shaOrVersion: key === sourceA.sourceKey ? "aaa" : "bbb" }))
    } as unknown as CatalogService;
    const multi = {
      getMergedCatalog: jest.fn().mockResolvedValue({
        metas: [metaA, metaB],
        perSource: [
          { source: sourceA, snapshot: { skillsRoot: "skills", metas: [metaA] } },
          { source: sourceB, snapshot: { skillsRoot: "skills", metas: [metaB] } }
        ],
        byCompositeKey
      })
    } as unknown as MultiSourceCatalogService;

    const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger;
    const engine = new SyncEngine(auth, config, logger, catalogService, multi);
    const result = await engine.sync(true);

    expect(result.status).toBe("success");
    expect(result.updated.sort()).toEqual(["a/shared", "b/shared"]);
    expect(catalogService.getContent).toHaveBeenCalledWith(sourceA.sourceKey, "skills/shared.mdc");
    expect(catalogService.getContent).toHaveBeenCalledWith(sourceB.sourceKey, "skills/shared.mdc");
    expect(writeFile).toHaveBeenCalledWith("a", "shared", expect.stringContaining(`body-${sourceA.sourceKey}`));
    expect(writeFile).toHaveBeenCalledWith("b", "shared", expect.stringContaining(`body-${sourceB.sourceKey}`));
  });
});
