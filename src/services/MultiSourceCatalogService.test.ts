import { MultiSourceCatalogService } from "./MultiSourceCatalogService";
import { CatalogService } from "./CatalogService";
import { Logger } from "../utils/logger";
import { ResolvedSource, SkillMeta } from "../types";

function makeLogger(): Logger {
  return { log: jest.fn(), warn: jest.fn(), error: jest.fn(), show: jest.fn(), dispose: jest.fn() } as unknown as Logger;
}

function source(label: string): ResolvedSource {
  return { type: "github-repo", value: `owner/${label}`, label, sourceKey: `github:owner/${label}` };
}

function meta(name: string, sha: string, srcLabel: string): SkillMeta {
  return {
    name,
    shaOrVersion: sha,
    skillType: "cursor-rule",
    path: `skills/${name}.mdc`,
    source: { type: "github-repo", value: `owner/${srcLabel}`, label: srcLabel, sourceKey: `github:owner/${srcLabel}` }
  };
}

describe("MultiSourceCatalogService", () => {
  it("merges per-source snapshots and indexes by composite key", async () => {
    const a = source("a");
    const b = source("b");
    const catalogService = {
      getCatalog: jest.fn().mockImplementation(async (resolved: ResolvedSource) => {
        if (resolved.label === "a") {
          return { skillsRoot: "skills", metas: [meta("alpha", "1", "a"), meta("shared", "2", "a")] };
        }
        return { skillsRoot: "skills", metas: [meta("beta", "3", "b"), meta("shared", "4", "b")] };
      })
    } as unknown as CatalogService;
    const svc = new MultiSourceCatalogService(catalogService, makeLogger());

    const merged = await svc.getMergedCatalog([a, b]);

    expect(catalogService.getCatalog).toHaveBeenCalledTimes(2);
    expect(merged.metas).toHaveLength(4);
    expect(merged.byCompositeKey.get("a/alpha")).toBeDefined();
    expect(merged.byCompositeKey.get("b/beta")).toBeDefined();
    expect(merged.byCompositeKey.get("a/shared")).toBeDefined();
    expect(merged.byCompositeKey.get("b/shared")).toBeDefined();
  });

  it("records per-source errors without aborting other sources", async () => {
    const a = source("a");
    const b = source("b");
    const catalogService = {
      getCatalog: jest.fn().mockImplementation(async (resolved: ResolvedSource) => {
        if (resolved.label === "a") {
          throw new Error("boom");
        }
        return { skillsRoot: "skills", metas: [meta("beta", "1", "b")] };
      })
    } as unknown as CatalogService;
    const svc = new MultiSourceCatalogService(catalogService, makeLogger());

    const merged = await svc.getMergedCatalog([a, b]);

    const aResult = merged.perSource.find((p) => p.source.label === "a");
    const bResult = merged.perSource.find((p) => p.source.label === "b");
    expect(aResult?.error).toBe("boom");
    expect(aResult?.snapshot).toBeUndefined();
    expect(bResult?.snapshot?.metas[0].name).toBe("beta");
    expect(merged.byCompositeKey.size).toBe(1);
  });
});
