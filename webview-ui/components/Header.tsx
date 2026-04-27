import React from "react";
import { IconPencil, IconSearch, IconSync } from "./icons";

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  showSearch?: boolean;
  sourceMode: "github-repo" | "custom-registry";
  sourceRepository: string;
  lastSynced: string | null;
  isSyncing: boolean;
  optedInCount: number;
  totalCount: number;
  sourceHint?: string | null;
  onChangeRepo: () => void;
  onSyncNow: () => void;
}

export function Header({
  searchQuery,
  onSearchChange,
  showSearch = true,
  sourceMode,
  sourceRepository,
  lastSynced,
  isSyncing,
  optedInCount,
  totalCount,
  sourceHint,
  onChangeRepo,
  onSyncNow
}: HeaderProps): React.JSX.Element {
  const syncText = isSyncing ? "Syncing…" : lastSynced ? formatLastSynced(lastSynced) : "Not synced yet";

  return (
    <header className="header">
      <div className="header-row">
        <div className="source-block">
          <span className="source-name" title={sourceRepository}>
            {sourceRepository.trim() ? sourceRepository : "—"}
          </span>
          {sourceMode === "github-repo" ? (
            <button
              type="button"
              className="source-edit-btn"
              onClick={onChangeRepo}
              disabled={isSyncing}
              aria-label="Change repository"
              title="Change repository"
            >
              <IconPencil />
            </button>
          ) : (
            <span className="source-kind">registry</span>
          )}
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
        {sourceMode !== "github-repo" && (
          <>
            <span className="meta-sep" aria-hidden>·</span>
            <button type="button" className="meta-link" onClick={onChangeRepo} disabled={isSyncing}>
              Change registry
            </button>
          </>
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
