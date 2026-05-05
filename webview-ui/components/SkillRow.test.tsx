import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { SkillRow } from "./SkillRow";
import { SkillInfo } from "../types/messages";

function makeSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    compositeKey: "repo/example",
    name: "example",
    description: "A short description",
    version: "abc1234",
    category: "Test",
    skillType: "cursor-rule",
    source: { label: "repo", type: "github-repo", sourceKey: "github:owner/repo" },
    ...overrides
  };
}

describe("SkillRow", () => {
  it("renders the source label as a badge with type-specific class", () => {
    render(<SkillRow skill={makeSkill()} isOptedIn={false} onToggle={() => {}} />);
    const badge = screen.getByText("repo");
    expect(badge).toHaveClass("skill-source-badge");
    expect(badge.className).toContain("skill-source-badge--github-repo");
    expect(badge).toHaveAttribute("title", expect.stringContaining("GitHub"));
  });

  it("emits the composite key on toggle", () => {
    const onToggle = jest.fn();
    render(<SkillRow skill={makeSkill({ compositeKey: "alpha/beta" })} isOptedIn={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("alpha/beta", true);
  });

  it("omits the badge when no source is present", () => {
    render(
      <SkillRow
        skill={makeSkill({ source: undefined })}
        isOptedIn
        onToggle={() => {}}
      />
    );
    expect(screen.queryByText("repo")).not.toBeInTheDocument();
  });
});
