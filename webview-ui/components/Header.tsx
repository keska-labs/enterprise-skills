import React from "react";
import { SkillSourceState } from "../types/messages";
import { IconPencil, IconSearch, IconSync } from "./icons";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  showSearch?: boolean;
  sources: SkillSourceState[];
  lastSynced: string | null;
  isSyncing: boolean;
  optedInCount: number;
  totalCount: number;
  sourceHint?: string | null;
  onAddSource: () => void;
  onRemoveSource: (sourceKey: string) => void;
  onSyncNow: () => void;
}

function sourceTypeLabel(type: SkillSourceState["type"]): string {
  return type === "github-repo" ? "GitHub" : "registry";
}

export function Header({
  searchQuery,
  onSearchChange,
  showSearch = true,
  sources,
  lastSynced,
  isSyncing,
  optedInCount,
  totalCount,
  sourceHint,
  onAddSource,
  onRemoveSource,
  onSyncNow
}: HeaderProps): React.JSX.Element {
  const syncText = isSyncing ? "Syncing…" : lastSynced ? formatLastSynced(lastSynced) : "Not synced yet";

  return (
    <header className="header">
      <div className="header-row">
        <div className="source-list-block">
          {sources.length === 0 ? (
            <span className="source-name source-name--empty" title="No sources configured">—</span>
          ) : (
            <ul className="source-list" aria-label="Configured skill sources">
              {sources.map((source) => (
                <li key={source.sourceKey} className="source-chip">
                  <span className="source-chip-name" title={`${source.label} • ${source.value}`}>
                    {source.label}
                  </span>
                  <span className="source-chip-kind" aria-label={`${sourceTypeLabel(source.type)} source`}>
                    {sourceTypeLabel(source.type)}
                  </span>
                  <button
                    type="button"
                    className="source-chip-remove"
                    onClick={() => onRemoveSource(source.sourceKey)}
                    disabled={isSyncing}
                    aria-label={`Remove source ${source.label}`}
                    title={`Remove source ${source.label}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="source-add-btn"
            onClick={onAddSource}
            disabled={isSyncing}
            aria-label="Add skill source"
            title="Add skill source"
          >
            <IconPencil />
            <span className="source-add-label">Add source</span>
          </button>
        </div>
        <button
          type="button"
          className="sync-icon-btn"
          onClick={onSyncNow}
          disabled={isSyncing}
          aria-label={isSyncing ? "Syncing…" : "Sync now"}
          title={isSyncing ? "Syncing…" : "Sync now"}
        >
          <IconSync className={isSyncing ? "spin-icon" : undefined} />
        </button>
      </div>
      {sourceHint?.trim() ? (
        <p className="source-hint" role="status">{sourceHint}</p>
      ) : null}
      <div className="header-meta" aria-live="polite">
        <span>{syncText}</span>
        {totalCount > 0 && (
          <span className="meta-sep" aria-hidden>·</span>
        )}
        {totalCount > 0 && (
          <span>{optedInCount}/{totalCount} enabled</span>
        )}
      </div>
      {showSearch ? (
        <div className="search-row">
          <IconSearch />
          <input
            className="search-input"
            aria-label="Filter skills"
            type="search"
            placeholder="Filter…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.currentTarget.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      ) : null}
    </header>
  );
}

function formatLastSynced(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Synced recently";
  }
  return `Synced ${date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}
