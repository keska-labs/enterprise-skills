import React from "react";
import { Recommendation } from "../types/messages";
import { SkillRow } from "./SkillRow";

interface RecommendedSkillListProps {
  recommendations: Recommendation[];
  optedInSkills: string[];
  onToggle: (skillName: string, optIn: boolean) => void;
}

export function RecommendedSkillList({
  recommendations,
  optedInSkills,
  onToggle
}: RecommendedSkillListProps): React.JSX.Element {
  const strong = recommendations.filter((r) => r.matchKind === "strong");
  const weak = recommendations.filter((r) => r.matchKind === "weak");
  const general = recommendations.filter((r) => r.matchKind === "general");

  const renderGroup = (title: string, slug: string, items: Recommendation[]): React.JSX.Element | null => {
    if (items.length === 0) {
      return null;
    }
    return (
      <section className="recommended-group" aria-labelledby={`rec-grp-${slug}`}>
        <h2 id={`rec-grp-${slug}`} className="recommended-group-title">
          {title}
        </h2>
        {items.map((rec) => (
          <div key={rec.skill.name} className="recommended-card">
            <ul className="reason-chips" aria-label="Why recommended">
              {(rec.aiReason ? [rec.aiReason] : rec.reasons).map((reason, i) => (
                <li key={`${rec.skill.name}-r-${i}`} className="reason-chip">
                  {reason}
                </li>
              ))}
            </ul>
            <SkillRow
              skill={rec.skill}
              isOptedIn={optedInSkills.includes(rec.skill.name)}
              onToggle={onToggle}
            />
          </div>
        ))}
      </section>
    );
  };

  return (
    <div className="recommended-layout">
      {renderGroup("Strong matches", "strong", strong)}
      {renderGroup("Other suggestions", "weak", weak)}
      {renderGroup("General-purpose", "general", general)}
    </div>
  );
}
