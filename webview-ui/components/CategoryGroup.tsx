import React from "react";
import { CategoryData } from "../types/messages";
import { SkillRow } from "./SkillRow";

interface CategoryGroupProps {
  category: CategoryData;
  optedInSkills: string[];
  onToggle: (skillName: string, optIn: boolean) => void;
  variant?: "default" | "results";
}

export function CategoryGroup({ category, optedInSkills, onToggle, variant = "default" }: CategoryGroupProps): React.JSX.Element | null {
  if (category.skills.length === 0) return null;

  return (
    <details className={`category${variant === "results" ? " category--results" : ""}`} open>
      <summary className="category-summary">
        {category.name}
        <span className="badge">{category.skills.length}</span>
      </summary>
      {category.skills.map((skill) => (
        <SkillRow
          key={skill.name}
          skill={skill}
          isOptedIn={optedInSkills.includes(skill.name)}
          onToggle={onToggle}
        />
      ))}
    </details>
  );
}
