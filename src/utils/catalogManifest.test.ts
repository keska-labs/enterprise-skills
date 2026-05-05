import { catalogManifestFingerprint } from "./catalogManifest";
import { SkillMeta } from "../types";

describe("catalogManifestFingerprint", () => {
  it("changes when skill versions change", () => {
    const a: SkillMeta[] = [{ name: "x", shaOrVersion: "v1", skillType: "skill" }];
    const b: SkillMeta[] = [{ name: "x", shaOrVersion: "v2", skillType: "skill" }];
    expect(catalogManifestFingerprint(a)).not.toBe(catalogManifestFingerprint(b));
  });

  it("is stable for same catalog content", () => {
    const metas: SkillMeta[] = [
      { name: "a", shaOrVersion: "1", skillType: "cursor-rule" },
      { name: "b", shaOrVersion: "2", skillType: "skill" }
    ];
    expect(catalogManifestFingerprint(metas)).toBe(catalogManifestFingerprint([...metas].reverse()));
  });
});
