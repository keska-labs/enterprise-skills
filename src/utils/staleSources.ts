import { StaleSourceInfo } from "../types";

/**
 * Render a stale-cache notice payload into a user-facing fragment like
 * `owner/repo (GitHub rate limit, retry at 8:42:13 PM)`. Caller wraps it in
 * the surrounding sentence ("Sync used cached catalog for …").
 */
export function formatStaleSources(stale: StaleSourceInfo[]): string {
  if (stale.length === 0) {
    return "";
  }

  const earliestRetry = pickEarliestRetry(stale);
  const reasonNote = stale.every((s) => s.reason === "rate_limited")
    ? "GitHub rate limit"
    : "upstream unreachable";
  const retryNote = earliestRetry ? `, retry at ${earliestRetry.toLocaleTimeString()}` : "";

  if (stale.length === 1) {
    return `${stale[0].label} (${reasonNote}${retryNote})`;
  }
  if (stale.length <= 3) {
    const labels = stale.map((s) => s.label).join(", ");
    return `${labels} (${reasonNote}${retryNote})`;
  }
  return `${stale.length} sources (${reasonNote}${retryNote})`;
}

function pickEarliestRetry(stale: StaleSourceInfo[]): Date | undefined {
  let earliest: Date | undefined;
  for (const entry of stale) {
    if (!entry.retryAt) {
      continue;
    }
    const parsed = new Date(entry.retryAt);
    if (Number.isNaN(parsed.getTime())) {
      continue;
    }
    if (!earliest || parsed < earliest) {
      earliest = parsed;
    }
  }
  return earliest;
}
