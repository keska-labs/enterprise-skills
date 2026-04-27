import React from "react";
import { IconSkills } from "./icons";

interface EnabledEmptyCalloutProps {
  onOpenBrowse: () => void;
}

export function EnabledEmptyCallout({ onOpenBrowse }: EnabledEmptyCalloutProps): React.JSX.Element {
  return (
    <section className="callout-card" aria-labelledby="enabled-empty-title">
      <div className="callout-visual" aria-hidden>
        <IconSkills width={18} height={18} />
      </div>
      <div className="callout-body">
        <h2 id="enabled-empty-title" className="callout-title">
          Start with your first skill
        </h2>
        <p className="callout-text">
          Browse the repository tree or search the full catalog, then enable the skills you want synced into{" "}
          <code>.cursor/rules</code> for this workspace.
        </p>
        <button type="button" className="button cta-button callout-cta" onClick={onOpenBrowse}>
          Open Browse
        </button>
      </div>
    </section>
  );
}
