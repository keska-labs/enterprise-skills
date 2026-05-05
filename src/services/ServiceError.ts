import axios from "axios";
import { SyncFailureReason } from "../types";

export class ServiceError extends Error {
  public constructor(
    public readonly reason: SyncFailureReason,
    message: string,
    /** Set for `rate_limited` failures so callers can tell the user when to retry. */
    public readonly retryAt?: Date
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function toServiceError(error: unknown, fallbackMessage: string): ServiceError {
  if (error instanceof ServiceError) {
    return error;
  }

  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const headers = normalizeHeaders(error.response?.headers);
    const bodyMessage = extractBodyMessage(error.response?.data);

    // GitHub returns 403 for both "your token is bad" and "you've used your
    // hourly budget" — disambiguate via headers/body before falling back to
    // auth_expired so we don't pop a Sign In prompt for rate limits.
    if (isRateLimited(status, headers, bodyMessage)) {
      const retryAt = computeRetryAt(headers);
      const friendly = retryAt
        ? `GitHub API rate limit reached. Resets at ${retryAt.toLocaleTimeString()}.`
        : "GitHub API rate limit reached. Please retry shortly.";
      return new ServiceError("rate_limited", friendly, retryAt);
    }

    if (status === 401 || status === 403) {
      return new ServiceError("auth_expired", "GitHub authorization expired. Please sign in again.");
    }

    if (status === 404) {
      return new ServiceError("source_invalid", "Configured source could not be found.");
    }

    if (error.code === "ECONNABORTED" || !error.response) {
      return new ServiceError("network", "Network error while reaching the skill source.");
    }
  }

  return new ServiceError("unknown", fallbackMessage);
}

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    out[key.toLowerCase()] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return out;
}

function extractBodyMessage(body: unknown): string {
  if (!body) {
    return "";
  }
  if (typeof body === "string") {
    return body;
  }
  if (typeof body === "object" && body !== null && "message" in body) {
    const msg = (body as { message?: unknown }).message;
    return typeof msg === "string" ? msg : "";
  }
  return "";
}

function isRateLimited(
  status: number | undefined,
  headers: Record<string, string>,
  bodyMessage: string
): boolean {
  if (status === 429) {
    return true;
  }
  if (status === 403) {
    if (headers["x-ratelimit-remaining"] === "0") {
      return true;
    }
    if (headers["retry-after"]) {
      return true;
    }
    if (/rate limit/i.test(bodyMessage)) {
      return true;
    }
  }
  return false;
}

function computeRetryAt(headers: Record<string, string>): Date | undefined {
  const reset = headers["x-ratelimit-reset"];
  if (reset) {
    const epochSeconds = Number(reset);
    if (Number.isFinite(epochSeconds) && epochSeconds > 0) {
      return new Date(epochSeconds * 1000);
    }
  }
  const retryAfter = headers["retry-after"];
  if (retryAfter) {
    const deltaSeconds = Number(retryAfter);
    if (Number.isFinite(deltaSeconds) && deltaSeconds >= 0) {
      return new Date(Date.now() + deltaSeconds * 1000);
    }
    const parsed = Date.parse(retryAfter);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return undefined;
}
