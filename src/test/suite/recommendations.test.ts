import * as assert from "assert";
import { recommend } from "../../services/SkillRecommender";
import type { WorkspaceProfile } from "../../services/WorkspaceAnalyzer";
import type { SkillMeta } from "../../types";

suite("SkillRecommender (extension host smoke)", () => {
  test("surfaces skills when dependency triggers match the workspace profile", () => {
    const workspaceProfile: WorkspaceProfile = {
      languages: new Set<string>(),
      dependencies: new Set<string>(["express"]),
      relativePaths: new Set<string>(["package.json"]),
      installedExtensions: new Set<string>(),
      agentsMdText: null,
      isMonorepo: false
    };

    const catalog: SkillMeta[] = [
      {
        name: "express-helper",
        shaOrVersion: "abc1234",
        skillType: "cursor-rule",
        triggers: {
          dependencies: ["express"],
          generalPurpose: false
        }
      }
    ];

    const ranked = recommend(workspaceProfile, catalog, []);
    assert.strictEqual(ranked.length, 1);
    assert.strictEqual(ranked[0].skill.name, "express-helper");
    assert.strictEqual(ranked[0].matchKind, "strong");
  });
});
