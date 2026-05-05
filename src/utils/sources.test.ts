import {
  buildSourceFromLegacy,
  combinedSourcesKey,
  compositeSkillKey,
  deriveSourceLabel,
  isComposite,
  parseCompositeSkillKey,
  resolveSource,
  sanitizeSourceLabel
} from "./sources";

describe("deriveSourceLabel", () => {
  it("uses owner/repo for github sources (slash preserved)", () => {
    expect(deriveSourceLabel({ type: "github-repo", value: "owner/my-repo" })).toBe("owner/my-repo");
  });

  it("strips .git suffix from github values", () => {
    expect(deriveSourceLabel({ type: "github-repo", value: "owner/my-repo.git" })).toBe("owner/my-repo");
  });

  it("derives owner/repo from a full GitHub URL", () => {
    expect(
      deriveSourceLabel({ type: "github-repo", value: "https://github.com/VoltAgent/awesome-agent-skills" })
    ).toBe("voltagent/awesome-agent-skills");
  });

  it("derives owner/repo from an SSH ref", () => {
    expect(deriveSourceLabel({ type: "github-repo", value: "git@github.com:owner/my-repo.git" })).toBe(
      "owner/my-repo"
    );
  });

  it("uses the hostname for registry sources", () => {
    expect(deriveSourceLabel({ type: "custom-registry", value: "https://skills.example.com/v1" })).toBe(
      "skills-example-com"
    );
  });

  it("falls back to a sanitized value when registry URL parsing fails", () => {
    expect(deriveSourceLabel({ type: "custom-registry", value: "not a url" })).toBe("not-a-url");
  });

  it("honours a user-provided label", () => {
    expect(deriveSourceLabel({ type: "github-repo", value: "owner/repo", label: "Internal Skills" })).toBe(
      "internal-skills"
    );
  });
});

describe("composite skill keys", () => {
  it("round-trips composite encoding and parsing", () => {
    const key = compositeSkillKey("repo", "skill-a");
    expect(key).toBe("repo/skill-a");
    expect(parseCompositeSkillKey(key)).toEqual({ label: "repo", name: "skill-a" });
    expect(isComposite(key)).toBe(true);
  });

  it("rejects bare names as composite keys", () => {
    expect(parseCompositeSkillKey("just-a-name")).toBeNull();
    expect(isComposite("just-a-name")).toBe(false);
  });

  it("preserves multi-segment labels (uses last `/` as separator)", () => {
    const key = compositeSkillKey("keska-labs/skills", "api-docs");
    expect(key).toBe("keska-labs/skills/api-docs");
    expect(parseCompositeSkillKey(key)).toEqual({ label: "keska-labs/skills", name: "api-docs" });
  });
});

describe("buildSourceFromLegacy", () => {
  it("synthesizes a github source from legacy keys", () => {
    expect(buildSourceFromLegacy("github-repo", "owner/repo", "")).toEqual([
      { type: "github-repo", value: "owner/repo" }
    ]);
  });

  it("synthesizes a registry source from legacy keys", () => {
    expect(buildSourceFromLegacy("custom-registry", "", "https://reg.example/")).toEqual([
      { type: "custom-registry", value: "https://reg.example/" }
    ]);
  });

  it("returns empty when nothing legacy was set", () => {
    expect(buildSourceFromLegacy("github-repo", "", "")).toEqual([]);
  });
});

describe("resolveSource", () => {
  it("attaches a derived label and source key", () => {
    const resolved = resolveSource({ type: "github-repo", value: "owner/repo" });
    expect(resolved.label).toBe("owner/repo");
    expect(resolved.sourceKey).toBe("github:owner/repo");
  });
});

describe("combinedSourcesKey", () => {
  it("orders sources deterministically regardless of input order", () => {
    const a = resolveSource({ type: "github-repo", value: "owner/a" });
    const b = resolveSource({ type: "custom-registry", value: "https://b.example" });
    expect(combinedSourcesKey([a, b])).toBe(combinedSourcesKey([b, a]));
  });
});

describe("sanitizeSourceLabel", () => {
  it("falls back to a stable placeholder for unsafe inputs", () => {
    expect(sanitizeSourceLabel("///")).toBe("source");
    expect(sanitizeSourceLabel(".")).toBe("source");
  });

  it("preserves `/` between segments and sanitizes each segment independently", () => {
    expect(sanitizeSourceLabel("Keska-Labs/Skills")).toBe("keska-labs/skills");
    expect(sanitizeSourceLabel("/owner//repo/")).toBe("owner/repo");
  });

  it("drops `.` and `..` segments to prevent path traversal", () => {
    expect(sanitizeSourceLabel("owner/../escape")).toBe("owner/escape");
    expect(sanitizeSourceLabel("./repo")).toBe("repo");
  });
});
