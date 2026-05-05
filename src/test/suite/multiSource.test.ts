import * as assert from "assert";
import { CatalogService } from "../../services/CatalogService";
import { MultiSourceCatalogService } from "../../services/MultiSourceCatalogService";
import { ResolvedSource, SkillMeta } from "../../types";
import { Logger } from "../../utils/logger";

function source(label: string): ResolvedSource {
  return {
    type: "github-repo",
    value: `owner/${label}`,
    label,
    sourceKey: `github:owner/${label}`
  };
}

function makeCatalogService(metasByLabel: Record<string, SkillMeta[]>): CatalogService {
  return {
    getCatalog: async (resolved: ResolvedSource | string) => {
      const label = typeof resolved === "string" ? resolved : resolved.label;
      const list = metasByLabel[label] ?? [];
      return { skillsRoot: "skills", metas: list.map((m) => ({ ...m })) };
    }
  } as unknown as CatalogService;
}

function noopLogger(): Logger {
  return {
    log: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    show: () => undefined,
    dispose: () => undefined
  } as unknown as Logger;
}

suite("MultiSourceCatalogService (extension host smoke)", () => {
  test("merges catalogs from multiple GitHub-style sources without collisions", async () => {
    const a = source("alpha");
    const b = source("beta");
    const catalog = makeCatalogService({
      alpha: [{ name: "shared", shaOrVersion: "1", skillType: "cursor-rule" }],
      beta: [
        { name: "shared", shaOrVersion: "2", skillType: "cursor-rule" },
        { name: "only-b", shaOrVersion: "3", skillType: "skill" }
      ]
    });

    const svc = new MultiSourceCatalogService(catalog, noopLogger());
    const merged = await svc.getMergedCatalog([a, b]);

    assert.strictEqual(merged.metas.length, 3);
    assert.ok(merged.byCompositeKey.get("alpha/shared"));
    assert.ok(merged.byCompositeKey.get("beta/shared"));
    assert.ok(merged.byCompositeKey.get("beta/only-b"));
  });
});
