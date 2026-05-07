import { buildRecommendationPrompt, wrapPromptForCursorSdkAgentRanking } from "./promptBuilder";
import { WorkspaceProfile } from "../WorkspaceAnalyzer";
import { ResolvedSource, SkillMeta } from "../../types";
import { DiscoveryPromptSection } from "../discoveryPrompt";

function profile(): WorkspaceProfile {
  return {
    languages: new Set(["typescript"]),
    dependencies: new Set(["react"]),
    relativePaths: new Set(["src/index.ts"]),
    installedExtensions: new Set(),
    agentsMdText: null,
    isMonorepo: false
  };
}

describe("buildRecommendationPrompt", () => {
  it("embeds compact discovery descriptors (no README markdown blob)", () => {
    const meta: SkillMeta = {
      name: "rule-a",
      shaOrVersion: "abc",
      skillType: "cursor-rule"
    };
    const src: ResolvedSource = {
      type: "open-skills",
      value: "directory",
      label: "skills-sh",
      sourceKey: "open-skills:directory"
    };
    const sections: DiscoveryPromptSection[] = [
      {
        source: src,
        repoUrl: "https://github.com/vercel-labs/skills",
        structureHint: "Monorepo of skills under skills/<name>/SKILL.md"
      }
    ];
    const prompt = buildRecommendationPrompt(profile(), [meta], [], sections);

    expect(prompt).toContain("Discovery directories");
    expect(prompt).toContain("https://github.com/vercel-labs/skills");
    expect(prompt).toContain("Monorepo of skills under skills/<name>");
    expect(prompt).toContain("open-skills:directory");
    expect(prompt).toContain("installSource");

    // Negative: prompt should not bloat with raw README markdown anymore
    expect(prompt).not.toMatch(/```/);
    expect(prompt.length).toBeLessThan(8000);
  });

  it("omits the discovery section entirely when no discovery sources are configured", () => {
    const meta: SkillMeta = { name: "rule-a", shaOrVersion: "abc", skillType: "cursor-rule" };
    const prompt = buildRecommendationPrompt(profile(), [meta], [], []);
    expect(prompt).not.toContain("Discovery directories");
    expect(prompt).not.toContain("installSource");
  });
});

describe("wrapPromptForCursorSdkAgentRanking", () => {
  it("prepends streaming narration guidance and preserves the task body", () => {
    const task = "TASK_BODY_UNIQUE_XYZ";
    const wrapped = wrapPromptForCursorSdkAgentRanking(task);
    expect(wrapped).toContain("[Skill Manager — streaming]");
    expect(wrapped).toContain("TASK_BODY_UNIQUE_XYZ");
    expect(wrapped.indexOf("[Skill Manager — streaming]")).toBeLessThan(wrapped.indexOf("TASK_BODY_UNIQUE_XYZ"));
  });
});
