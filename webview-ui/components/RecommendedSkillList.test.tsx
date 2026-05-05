import React from "react";
import { render, screen } from "@testing-library/react";
import { RecommendedSkillList } from "./RecommendedSkillList";

describe("RecommendedSkillList", () => {
  it("renders reason chips and skill name", () => {
    render(
      <RecommendedSkillList
        recommendations={[
          {
            skill: {
              name: "my-skill",
              description: "Does things",
              version: "1.0.0",
              category: "Test",
              skillType: "cursor-rule"
            },
            score: 75,
            reasons: ["Detected react in dependencies"],
            matchKind: "strong"
          }
        ]}
        optedInSkills={[]}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText("Detected react in dependencies")).toBeInTheDocument();
    expect(screen.getByText("my-skill")).toBeInTheDocument();
  });

  it("groups weak and general sections independently", () => {
    render(
      <RecommendedSkillList
        recommendations={[
          {
            skill: { name: "w", description: "", version: "1", category: "", skillType: "cursor-rule" },
            score: 30,
            reasons: ["Weak signal"],
            matchKind: "weak"
          },
          {
            skill: { name: "g", description: "", version: "1", category: "", skillType: "cursor-rule" },
            score: 15,
            reasons: ["General-purpose recommendation"],
            matchKind: "general"
          }
        ]}
        optedInSkills={[]}
        onToggle={() => {}}
      />
    );

    expect(screen.getByText("Other suggestions")).toBeInTheDocument();
    expect(screen.getByText("General-purpose")).toBeInTheDocument();
  });
});
