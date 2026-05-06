import { OpenSkillsCatalogProvider } from "./OpenSkillsCatalogProvider";

describe("OpenSkillsCatalogProvider", () => {
  it("returns an empty prefetched catalog", async () => {
    const provider = new OpenSkillsCatalogProvider();
    const snap = await provider.fetchCatalog();
    expect(snap.metas).toHaveLength(0);
    expect(snap.skillsRoot).toBe("");
  });

  it("points at vercel-labs/agent-skills (the actual skill bundle, not the CLI repo)", () => {
    const provider = new OpenSkillsCatalogProvider();
    const desc = provider.getDiscoveryDescriptor();
    expect(desc.repoUrl).toBe("https://github.com/vercel-labs/agent-skills");
    expect(desc.repoUrl).not.toContain("vercel-labs/skills/");
    expect(desc.structureHint).toMatch(/skills\/<name>/i);
    expect(desc.structureHint).toContain("vercel-labs/agent-skills");
  });

  it("rejects fetchContent (discovery-only)", async () => {
    const provider = new OpenSkillsCatalogProvider();
    await expect(provider.fetchContent()).rejects.toMatchObject({ reason: "source_invalid" });
  });
});
