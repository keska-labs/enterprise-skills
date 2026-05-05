import { parseSkillMdFrontmatter } from "./skillMdFrontmatter";

describe("parseSkillMdFrontmatter", () => {
  it("parses nested metadata.triggers lists and generalPurpose", () => {
    const md = `---
name: api-documentation
description: Docs skill
metadata:
  version: "1.0"
  category: Documentation
  triggers:
    files: openapi.yaml, swagger.json
    dependencies: fastapi, express
    keywords: rest, graphql
    generalPurpose: false
---
`;
    const parsed = parseSkillMdFrontmatter(md);
    expect(parsed.name).toBe("api-documentation");
    expect(parsed.metadata?.version).toBe("1.0");
    expect(parsed.metadata?.category).toBe("Documentation");
    expect(parsed.triggers?.files).toEqual(["openapi.yaml", "swagger.json"]);
    expect(parsed.triggers?.dependencies).toEqual(["fastapi", "express"]);
    expect(parsed.triggers?.keywords).toEqual(["rest", "graphql"]);
    expect(parsed.triggers?.generalPurpose).toBe(false);
  });

  it("parses commit-style quoted scoped npm dependencies", () => {
    const md = `---
description: Commits
name: commit-message-style
metadata:
  category: Workflow
  triggers:
    dependencies: "@commitlint/cli", "@commitlint/config-conventional", husky
    generalPurpose: true
---
`;
    const parsed = parseSkillMdFrontmatter(md);
    expect(parsed.triggers?.dependencies).toEqual(["@commitlint/cli", "@commitlint/config-conventional", "husky"]);
    expect(parsed.triggers?.generalPurpose).toBe(true);
  });
});
