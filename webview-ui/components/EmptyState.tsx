import React from "react";
import { IconAlert, IconCloudOff, IconKey, IconSkills } from "./icons";

interface EmptyStateProps {
  connectionHealth: "ok" | "auth_required" | "invalid_source" | "offline" | "unknown";
  detailMessage?: string | null;
  onConnect: () => void;
}

export function EmptyState({ connectionHealth, detailMessage, onConnect }: EmptyStateProps): React.JSX.Element {
  if (connectionHealth === "offline") {
    return (
      <div className="empty-state empty-state--framed">
        <div className="empty-illustration empty-illustration--muted">
          <IconCloudOff />
        </div>
        <h2 className="empty-title">Cannot reach GitHub</h2>
        <p className="empty-body">
          Check your network connection, then try again. Skills stay on your machine until sync succeeds.
        </p>
        <button type="button" className="button cta-button" onClick={onConnect}>
          Retry connection
        </button>
      </div>
    );
  }

  if (connectionHealth === "auth_required") {
    return (
      <div className="empty-state empty-state--framed">
        <div className="empty-illustration">
          <IconKey />
        </div>
        <h2 className="empty-title">GitHub sign-in required</h2>
        <p className="empty-body">
          Your session ended or permissions changed. Sign in to pick a repository and sync skills securely.
        </p>
        <button type="button" className="button cta-button" onClick={onConnect}>
          Sign in with GitHub
        </button>
      </div>
    );
  }

  if (connectionHealth === "invalid_source") {
    return (
      <div className="empty-state empty-state--framed">
        <div className="empty-illustration empty-illustration--warn">
          <IconAlert />
        </div>
        <h2 className="empty-title">Source needs attention</h2>
        <p className="empty-body">
          {detailMessage?.trim()
            ? detailMessage
            : "Update your repository or registry settings so we can find skills to sync."}
        </p>
        <button type="button" className="button cta-button" onClick={onConnect}>
          Fix configuration
        </button>
      </div>
    );
  }

  return (
    <div className="empty-state empty-state--framed">
      <div className="empty-illustration">
        <IconSkills />
      </div>
      <h2 className="empty-title">Connect a skill source</h2>
      <p className="empty-body">
        Choose a GitHub repository—<strong>private repositories</strong> are supported with your sign-in—that hosts{" "}
        <code>.cursor/rules</code>, or switch to a custom registry in settings. Skills you enable are copied into this workspace for your agent.
      </p>
      <button type="button" className="button cta-button" onClick={onConnect}>
        Connect source
      </button>
      <p className="empty-footnote">Private repos use your GitHub token; nothing leaves VS Code without sync.</p>
    </div>
  );
}
