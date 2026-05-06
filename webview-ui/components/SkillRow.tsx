import React, { useState } from "react";
import { SkillInfo, SkillSourceInfo } from "../types/messages";
import { IconCursorRule, IconSkillPkg } from "./icons";

interface SkillRowProps {
  skill: SkillInfo;
  isOptedIn: boolean;
  onToggle: (compositeKey: string, optIn: boolean) => void;
}

export function SkillRow({ skill, isOptedIn, onToggle }: SkillRowProps): React.JSX.Element {
  const id = `skill-toggle-${skill.compositeKey.replace(/[^\w-]+/g, "-")}`;
  const [tipOpen, setTipOpen] = useState(false);

  const isSkillPkg = skill.skillType === "skill";
  const hasInfo = Boolean(skill.version || skill.fileCount);
  const tipParts: string[] = [];
  if (skill.version) {
    tipParts.push(`rev ${skill.version}`);
  }
  if (isSkillPkg && skill.fileCount != null && skill.fileCount > 0) {
    tipParts.push(`${skill.fileCount} file${skill.fileCount === 1 ? "" : "s"}`);
  }
  const tipContent = tipParts.join(" · ");

  const typeLabel = isSkillPkg ? "Skill package" : "Cursor rule";
  const sourceLabel = skill.source?.label;
  function sourceKindLabel(type: SkillSourceInfo["type"]): string {
    switch (type) {
      case "github-repo":
        return "GitHub";
      case "custom-registry":
        return "Registry";
      case "official-skills":
        return "Official directory";
      case "open-skills":
        return "Open directory";
      default:
        return "Registry";
    }
  }

  const sourceTitle = skill.source
    ? `${sourceKindLabel(skill.source.type)} source: ${skill.source.label}`
    : undefined;

  if (skill.isDiscoverySummary) {
    return (
      <div className="skill-row skill-row--discovery-summary">
        <div className="skill-info">
          <div className="skill-title-row">
            <span className="skill-type-badge" aria-label="Discovery directory" title="Discovery directory">
              <IconSkillPkg />
            </span>
            <span className="skill-title">{skill.name}</span>
            <span className="skill-source-badge skill-source-badge--muted" title="Not installable from this row">
              discovery directory
            </span>
          </div>
          {skill.description ? (
            <div className="skill-description">{skill.description}</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`skill-row${isOptedIn ? " skill-row--active" : ""}`}>
      <label htmlFor={id} className="skill-info">
        <div className="skill-title-row">
          <span className="skill-type-badge" aria-label={typeLabel} title={typeLabel}>
            {isSkillPkg ? <IconSkillPkg /> : <IconCursorRule />}
          </span>
          <span className="skill-title">{skill.name}</span>
          {sourceLabel ? (
            <span
              className={`skill-source-badge skill-source-badge--${skill.source?.type ?? "unknown"}`}
              title={sourceTitle}
            >
              {sourceLabel}
            </span>
          ) : null}
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
          onChange={(e) => onToggle(skill.compositeKey, e.currentTarget.checked)}
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
