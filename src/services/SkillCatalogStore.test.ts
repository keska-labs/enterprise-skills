import * as vscode from "vscode";
import { SkillCatalogStore } from "./SkillCatalogStore";
import { SkillMeta } from "../types";

function createTestMemento(): vscode.Memento {
  const backing = new Map<string, unknown>();
  return {
    keys: () => [...backing.keys()],
    get: <T>(key: string, defaultValue?: T) =>
      (backing.has(key) ? (backing.get(key) as T) : (defaultValue as T)),
    update: async (key: string, value: unknown) => {
      backing.set(key, value);
    }
  };
}

describe("SkillCatalogStore.merge", () => {
  it("preserves manifest fields when browse listings overwrite indexed skills", () => {
    const store = new SkillCatalogStore(createTestMemento());
    const key = "github:test/skills";
    const rich: SkillMeta = {
      name: "security-code-review",
      description: "Security checklist",
      category: "Security",
      path: "skills/security-code-review.md",
      shaOrVersion: "aaa111",
      version: "aaa111",
      skillType: "cursor-rule",
      triggers: { generalPurpose: true, keywords: ["owasp"] }
    };
    const browseStub: SkillMeta = {
      name: "security-code-review",
      path: "skills/security-code-review.md",
      shaOrVersion: "bbb222",
      version: "bbb222",
      category: "Uncategorized",
      skillType: "cursor-rule"
    };

    store.save(key, "skills", [rich]);
    store.merge(key, "skills", [browseStub]);

    const loaded = store.load(key);
    expect(loaded?.metas).toHaveLength(1);
    expect(loaded?.metas[0].description).toBe("Security checklist");
    expect(loaded?.metas[0].triggers?.generalPurpose).toBe(true);
    expect(loaded?.metas[0].shaOrVersion).toBe("aaa111");
  });

  it("still accepts browse stubs for skills not yet indexed", () => {
    const store = new SkillCatalogStore(createTestMemento());
    const key = "github:test/skills";
    const stub: SkillMeta = {
      name: "new-rule",
      path: "skills/new-rule.md",
      shaOrVersion: "ccc333",
      version: "ccc333",
      category: "Uncategorized",
      skillType: "cursor-rule"
    };

    store.merge(key, "skills", [stub]);
    const loaded = store.load(key);
    expect(loaded?.metas[0].name).toBe("new-rule");
  });
});
