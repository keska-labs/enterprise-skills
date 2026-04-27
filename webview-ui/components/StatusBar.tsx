import React from "react";

interface StatusBarProps {
  lastSynced: string | null;
  isSyncing: boolean;
  optedInCount: number;
  totalCount: number;
}

export function StatusBar({ lastSynced, isSyncing, optedInCount, totalCount }: StatusBarProps): React.JSX.Element {
  const syncedText = isSyncing
    ? "Syncing…"
    : lastSynced
    ? `Last synced ${lastSynced}`
    : "Never synced";

  return (
    <div className="status-bar" aria-live="polite">
      <span className="status-bar-item">{syncedText}</span>
      {totalCount > 0 && (
        <span className="status-bar-item">{optedInCount} / {totalCount} opted in</span>
      )}
    </div>
  );
}
