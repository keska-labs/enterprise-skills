import { OfficialSkillsCatalogProvider } from "./OfficialSkillsCatalogProvider";

describe("OfficialSkillsCatalogProvider", () => {
  it("returns an empty prefetched catalog", async () => {
    const provider = new OfficialSkillsCatalogProvider();
    const snap = await provider.fetchCatalog();
    expect(snap.metas).toHaveLength(0);
    expect(snap.skillsRoot).toBe("");
  });

  it("exposes a static discovery descriptor pointing at awesome-agent-skills", () => {
    const provider = new OfficialSkillsCatalogProvider();
    const desc = provider.getDiscoveryDescriptor();
    expect(desc.repoUrl).toContain("VoltAgent/awesome-agent-skills");
    expect(desc.structureHint).toMatch(/SKILL\.md|cursor-rule|cursor\/rules|awesome-list/i);
  });

  it("rejects fetchContent (discovery-only)", async () => {
    const provider = new OfficialSkillsCatalogProvider();
    await expect(provider.fetchContent()).rejects.toMatchObject({ reason: "source_invalid" });
  });
});
