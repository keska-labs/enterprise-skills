import { globMatchesPattern, recommend } from "./SkillRecommender";
import { WorkspaceProfile } from "./WorkspaceAnalyzer";
import { SkillMeta } from "../types";

function makeProfile(partial: Partial<WorkspaceProfile>): WorkspaceProfile {
  return {
    languages: partial.languages ?? new Set(),
    dependencies: partial.dependencies ?? new Set(),
    relativePaths: partial.relativePaths ?? new Set(),
    installedExtensions: partial.installedExtensions ?? new Set(),
    agentsMdText: partial.agentsMdText ?? null,
    isMonorepo: partial.isMonorepo ?? false
  };
}

describe("globMatchesPattern", () => {
  it("matches basenames and path segments", () => {
    expect(globMatchesPattern("package.json", "pkg/package.json", "package.json")).toBe(true);
    expect(globMatchesPattern("*.tsx", "src/app.tsx", "app.tsx")).toBe(true);
    expect(globMatchesPattern(".github/pull_request_template.md", ".github/pull_request_template.md", "pull_request_template.md")).toBe(true);
  });
});

describe("recommend", () => {
  it("scores dependency triggers", () => {
    const metas: SkillMeta[] = [
      {
        name: "api-rule",
        shaOrVersion: "deadbeef",
        skillType: "cursor-rule",
        triggers: { dependencies: ["express"], generalPurpose: false }
      }
    ];
    const out = recommend(makeProfile({ dependencies: new Set(["express"]) }), metas, []);
    expect(out).toHaveLength(1);
    expect(out[0].skill.name).toBe("api-rule");
    expect(out[0].matchKind).toBe("strong");
  });

  it("excludes opted-in skills", () => {
    const metas: SkillMeta[] = [
      {
        name: "x",
        shaOrVersion: "a",
        skillType: "cursor-rule",
        triggers: { generalPurpose: true }
      }
    ];
    const out = recommend(makeProfile({}), metas, ["x"]);
    expect(out).toHaveLength(0);
  });

  it("applies general-purpose baseline when no strong signals", () => {
    const metas: SkillMeta[] = [
      {
        name: "sec-review",
        shaOrVersion: "b",
        skillType: "cursor-rule",
        triggers: { generalPurpose: true }
      }
    ];
    const out = recommend(makeProfile({}), metas, []);
    expect(out).toHaveLength(1);
    expect(out[0].matchKind).toBe("general");
    expect(out[0].reasons.some((r) => r.includes("General-purpose"))).toBe(true);
  });

  it("matches keyword triggers against AGENTS.md", () => {
    const metas: SkillMeta[] = [
      {
        name: "pentest",
        shaOrVersion: "c",
        skillType: "skill",
        triggers: { keywords: ["owasp", "pentest"], generalPurpose: false }
      }
    ];
    const out = recommend(makeProfile({ agentsMdText: "we run owasp checks before release." }), metas, []);
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].skill.name).toBe("pentest");
  });
});
