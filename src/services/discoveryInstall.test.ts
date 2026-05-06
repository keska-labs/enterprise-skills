import { installFromDiscoveryMeta } from "./discoveryInstall";
import { SkillMeta } from "../types";

describe("installFromDiscoveryMeta", () => {
  it("adds the backing GitHub source, migrates opted-in key, and syncs", async () => {
    const meta: SkillMeta = {
      name: "docx",
      shaOrVersion: "x",
      skillType: "skill",
      isDiscoveryOnly: true,
      installSourceRef: { type: "github-repo", value: "anthropics/skills" }
    };

    const addSource = jest.fn().mockResolvedValue(undefined);
    const setOptedInSkills = jest.fn().mockResolvedValue(undefined);
    const getOptedInSkills = jest.fn().mockReturnValue(["officialskills-sh/docx"]);
    const configService = { addSource, setOptedInSkills, getOptedInSkills };

    const sync = jest.fn().mockResolvedValue(undefined);
    const syncEngine = { sync };

    const logger = { log: jest.fn() };

    await installFromDiscoveryMeta(
      meta,
      "officialskills-sh/docx",
      configService as never,
      syncEngine as never,
      logger as never
    );

    expect(addSource).toHaveBeenCalledWith({ type: "github-repo", value: "anthropics/skills" });
    expect(setOptedInSkills).toHaveBeenCalled();
    const next = setOptedInSkills.mock.calls[0][0] as string[];
    expect(next).toContain("anthropics/skills/docx");
    expect(next).not.toContain("officialskills-sh/docx");
    expect(sync).toHaveBeenCalledWith(true);
  });
});
