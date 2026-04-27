import React, { useMemo } from "react";
import { BrowseEntry } from "../types/messages";
import { IconFile, IconFolder } from "./icons";

interface BrowseTreeProps {
  entries: BrowseEntry[];
  browseChildren: Record<string, BrowseEntry[]>;
  expandingPath: string | null;
  onExpandDir: (fullPath: string) => void;
}

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
      {sorted.map((entry) => (
        <li key={entry.path} className="browse-tree-item">
          {entry.type === "dir" ? (
            <>
              <button
                type="button"
                className="browse-dir"
                onClick={() => props.onExpandDir(entry.path)}
                disabled={props.expandingPath === entry.path}
                aria-expanded={props.browseChildren[entry.path] !== undefined}
              >
                <span className="browse-dir-glyph" aria-hidden>
                  <IconFolder />
                </span>
                <span className="browse-chevron" aria-hidden>
                  {props.browseChildren[entry.path] ? "▾" : "▸"}
                </span>
                <span className="browse-name">{entry.name}</span>
                {props.expandingPath === entry.path ? <span className="browse-loading-inline">Loading…</span> : null}
              </button>
              {props.browseChildren[entry.path] ? (
                <BrowseTree
                  entries={props.browseChildren[entry.path]!}
                  browseChildren={props.browseChildren}
                  expandingPath={props.expandingPath}
                  onExpandDir={props.onExpandDir}
                />
              ) : null}
            </>
          ) : (
            <div className="browse-file-row">
              <span className="browse-file-glyph" aria-hidden>
                <IconFile />
              </span>
              <span className="browse-name browse-name--file">{entry.name}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
