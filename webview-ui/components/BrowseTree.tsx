import React, { useMemo } from "react";
import { BrowseEntry } from "../types/messages";
import { IconFile, IconFolder } from "./icons";

interface BrowseTreeProps {
  entries: BrowseEntry[];
  browseChildren: Record<string, BrowseEntry[]>;
  collapsedPaths: Set<string>;
  expandingPath: string | null;
  skillsRootPath: string;
  selectedSkills: Set<string>;
  insideSkillPackage?: boolean;
  onExpandDir: (fullPath: string) => void;
  onToggleSkill: (skillName: string, optIn: boolean) => void;
}

function deriveSkillName(root: string, filePath: string): string {
  const normalizedRoot = root.replace(/^\/+|\/+$/g, "");
  const normalizedFile = filePath.replace(/^\/+|\/+$/g, "");
  const relative = normalizedRoot && normalizedFile.startsWith(`${normalizedRoot}/`)
    ? normalizedFile.slice(`${normalizedRoot}/`.length)
    : normalizedFile;
  return relative.replace(/\.(md|mdc|yaml|yml)$/i, "").split("/").filter(Boolean).join("-");
}

const RULE_FILE_PATTERN = /\.(md|mdc|yaml|yml)$/i;

export function BrowseTree(props: BrowseTreeProps): React.JSX.Element {
  const sorted = useMemo(
    () =>
      [...props.entries].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "dir" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      }),
    [props.entries]
  );

  return (
    <ul className="browse-tree">
      {sorted.map((entry) => {
        const children = props.browseChildren[entry.path];
        const isSkillPackage = Boolean(children?.some((child) => child.type === "file" && child.name === "SKILL.md"));
        const childInsideSkillPackage = props.insideSkillPackage || isSkillPackage;
        return (
          <li key={entry.path} className="browse-tree-item">
            {entry.type === "dir" ? (
            <>
              {(() => {
                const isLoaded = children !== undefined;
                const isCollapsed = props.collapsedPaths.has(entry.path);
                const isExpanded = isLoaded && !isCollapsed;
                const skillName = deriveSkillName(props.skillsRootPath, entry.path);
                return (
                  <div className="browse-file-row">
                    {isSkillPackage && !props.insideSkillPackage ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${entry.name}`}
                        checked={props.selectedSkills.has(skillName)}
                        onChange={(e) => props.onToggleSkill(skillName, e.currentTarget.checked)}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="browse-dir"
                      onClick={() => props.onExpandDir(entry.path)}
                      disabled={props.expandingPath === entry.path}
                      aria-expanded={isExpanded}
                    >
                      <span className="browse-dir-glyph" aria-hidden>
                        <IconFolder />
                      </span>
                      <span className="browse-chevron" aria-hidden>
                        {isExpanded ? "▾" : "▸"}
                      </span>
                      <span className="browse-name">{entry.name}</span>
                      {props.expandingPath === entry.path ? <span className="browse-loading-inline">Loading…</span> : null}
                    </button>
                  </div>
                );
              })()}
              {props.browseChildren[entry.path] && !props.collapsedPaths.has(entry.path) ? (
                <BrowseTree
                  entries={props.browseChildren[entry.path]!}
                  browseChildren={props.browseChildren}
                  collapsedPaths={props.collapsedPaths}
                  expandingPath={props.expandingPath}
                  skillsRootPath={props.skillsRootPath}
                  selectedSkills={props.selectedSkills}
                  insideSkillPackage={childInsideSkillPackage}
                  onExpandDir={props.onExpandDir}
                  onToggleSkill={props.onToggleSkill}
                />
              ) : null}
            </>
            ) : (
              <div className="browse-file-row">
                {RULE_FILE_PATTERN.test(entry.name) && !props.insideSkillPackage ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${entry.name}`}
                    checked={props.selectedSkills.has(deriveSkillName(props.skillsRootPath, entry.path))}
                    onChange={(e) => {
                      const skillName = deriveSkillName(props.skillsRootPath, entry.path);
                      props.onToggleSkill(skillName, e.currentTarget.checked);
                    }}
                  />
                ) : null}
                <span className="browse-file-glyph" aria-hidden>
                  <IconFile />
                </span>
                <span className="browse-name browse-name--file">{entry.name}</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
