import { isExcludedPath, isStandaloneRuleCandidate } from "./RepoService";

describe("isExcludedPath", () => {
  const excluded = [
    ".cursor/rules/foo.mdc",
    ".cursor/skills/foo/SKILL.md",
    "node_modules/pkg/SKILL.md",
    "dist/index.mdc",
    "build/output/foo.md",
    ".git/HEAD",
    ".github/workflows/release.yml",
    ".vscode/settings.json",
    "vendor/x.mdc",
    "coverage/lcov.info",
    "src/.venv/x.mdc",
    "deep/nested/.terraform/foo.mdc"
  ];
  it.each(excluded)("excludes %s", (p) => {
    expect(isExcludedPath(p)).toBe(true);
  });

  const allowed = [
    "skills/api-docs/SKILL.md",
    "rules/security/checklist.md",
    "commit-style.mdc",
    "docs/standards/style.mdc",
    "src/skills/x/SKILL.md"
  ];
  it.each(allowed)("does not exclude %s", (p) => {
    expect(isExcludedPath(p)).toBe(false);
  });
});

describe("isStandaloneRuleCandidate", () => {
  it("treats .mdc anywhere as a rule", () => {
    expect(isStandaloneRuleCandidate("foo.mdc", "foo.mdc")).toBe(true);
    expect(isStandaloneRuleCandidate("docs/style.mdc", "style.mdc")).toBe(true);
  });

  it("treats .md/.yaml/.yml only inside rule folders", () => {
    expect(isStandaloneRuleCandidate("rules/x.md", "x.md")).toBe(true);
    expect(isStandaloneRuleCandidate("skills/foo/x.yaml", "x.yaml")).toBe(true);
    expect(isStandaloneRuleCandidate(".skills/x.yml", "x.yml")).toBe(true);
  });

  it("rejects README and other docs at repo root", () => {
    expect(isStandaloneRuleCandidate("README.md", "README.md")).toBe(false);
    expect(isStandaloneRuleCandidate("CONTRIBUTING.md", "CONTRIBUTING.md")).toBe(false);
    expect(isStandaloneRuleCandidate("docs/intro.md", "intro.md")).toBe(false);
  });

  it("rejects unsupported extensions", () => {
    expect(isStandaloneRuleCandidate("rules/x.txt", "x.txt")).toBe(false);
    expect(isStandaloneRuleCandidate("foo.json", "foo.json")).toBe(false);
  });
});
