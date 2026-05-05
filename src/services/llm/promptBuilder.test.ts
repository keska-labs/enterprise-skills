import { buildRecommendationPrompt } from "./promptBuilder";
import { WorkspaceProfile } from "../WorkspaceAnalyzer";
import { SkillMeta } from "../../types";

describe("buildRecommendationPrompt", () => {
  it("includes workspace signals and JSON-only instruction", () => {
    const profile: WorkspaceProfile = {
      languages: new Set(["typescript"]),
      dependencies: new Set(["react"]),
      relativePaths: new Set(["package.json"]),
      installedExtensions: new Set(),
      agentsMdText: "use graphql",
      isMonorepo: false
    };
    const metas: SkillMeta[] = [
      {
        name: "api-designer",
        shaOrVersion: "abc",
        skillType: "skill",
        description: "REST APIs",
        category: "Workflow",
        triggers: { dependencies: ["express"] }
      }
    ];
    const prompt = buildRecommendationPrompt(profile, metas, []);
    expect(prompt).toContain("typescript");
    expect(prompt).toContain("react");
    expect(prompt).toContain("api-designer");
    expect(prompt).toContain("Respond with ONLY valid JSON");
    expect(prompt).toContain("use graphql");
  });

  it("excludes opted-in skills from catalog lines", () => {
    const profile: WorkspaceProfile = {
      languages: new Set(),
      dependencies: new Set(),
      relativePaths: new Set(),
      installedExtensions: new Set(),
      agentsMdText: null,
      isMonorepo: false
    };
    const metas: SkillMeta[] = [
      { name: "keep", shaOrVersion: "1", skillType: "skill" },
      { name: "already-opted", shaOrVersion: "2", skillType: "skill" }
    ];
    const prompt = buildRecommendationPrompt(profile, metas, ["already-opted"]);
    expect(prompt).toContain("keep");
    expect(prompt).not.toContain("already-opted");
  });
});
