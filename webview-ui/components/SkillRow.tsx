import React, { useState } from "react";
import { SkillInfo } from "../types/messages";

interface SkillRowProps {
  skill: SkillInfo;
  isOptedIn: boolean;
  onToggle: (skillName: string, optIn: boolean) => void;
}

export function SkillRow({ skill, isOptedIn, onToggle }: SkillRowProps): React.JSX.Element {
  const id = `skill-toggle-${skill.name.replace(/[^\w-]+/g, "-")}`;
  const [tipOpen, setTipOpen] = useState(false);

  const hasInfo = Boolean(skill.version);
  const tipContent = [skill.version ? `rev ${skill.version}` : null].filter(Boolean).join(" · ");

  return (
    <div className={`skill-row${isOptedIn ? " skill-row--active" : ""}`}>
      <label htmlFor={id} className="skill-info">
        <div className="skill-title-row">
          <span className="skill-title">{skill.name}</span>
          {hasInfo && (
            <span className="skill-info-anchor">
              <button
                type="button"
                className="skill-info-btn"
                aria-label={`Details for ${skill.name}`}
                onClick={(e) => { e.preventDefault(); setTipOpen((v) => !v); }}
                onBlur={() => setTipOpen(false)}
                tabIndex={-1}
              >
                <InfoDot />
              </button>
              {tipOpen && (
                <span className="skill-info-tip" role="tooltip">
                  {tipContent}
                </span>
              )}
            </span>
          )}
        </div>
        {skill.description ? (
          <div className="skill-description">{skill.description}</div>
        ) : null}
      </label>
      <div className="skill-actions">
        <input
          id={id}
          className="skill-toggle"
          type="checkbox"
          checked={isOptedIn}
          aria-label={`${isOptedIn ? "Disable" : "Enable"} ${skill.name}`}
          onChange={(e) => onToggle(skill.name, e.currentTarget.checked)}
        />
      </div>
    </div>
  );
}

function InfoDot(): React.JSX.Element {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="8" cy="8" r="7" fillOpacity="0.18" />
      <path d="M8 6.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm-.75 1h1.5v4H7.25V7.5z" />
    </svg>
  );
}
