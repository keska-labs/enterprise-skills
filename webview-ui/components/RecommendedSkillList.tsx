import React from "react";
import { Recommendation } from "../types/messages";
import { SkillRow } from "./SkillRow";

interface RecommendedSkillListProps {
  recommendations: Recommendation[];
  optedInSkills: string[];
  onToggle: (compositeKey: string, optIn: boolean) => void;
}

export function RecommendedSkillList({
  recommendations,
  optedInSkills,
  onToggle
}: RecommendedSkillListProps): React.JSX.Element {
  const strong = recommendations.filter((r) => r.matchKind === "strong");
  const weak = recommendations.filter((r) => r.matchKind === "weak");
  const general = recommendations.filter((r) => r.matchKind === "general");

  const renderReasons = (rec: Recommendation): React.JSX.Element | null => {
    // AI reasons are full sentences, often a couple of lines. Pill chips
    // squeeze them into hard-to-read shapes — render as a quoted prose block
    // with an explicit "AI" label so the source is obvious. Heuristic reasons
    // are short labels and stay as chips.
    if (rec.aiReason) {
      return (
        <figure className="reason-prose" aria-label="Why recommended">
          <span className="reason-prose-label">AI</span>
          <blockquote className="reason-prose-text">{rec.aiReason}</blockquote>
        </figure>
      );
    }
    if (rec.reasons.length === 0) {
      return null;
    }
    return (
      <ul className="reason-chips" aria-label="Why recommended">
        {rec.reasons.map((reason, i) => (
          <li key={`${rec.skill.compositeKey}-r-${i}`} className="reason-chip">
            {reason}
          </li>
        ))}
      </ul>
    );
  };

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
          <div key={rec.skill.compositeKey} className="recommended-card">
            {renderReasons(rec)}
            <SkillRow
              skill={rec.skill}
              isOptedIn={optedInSkills.includes(rec.skill.compositeKey)}
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
