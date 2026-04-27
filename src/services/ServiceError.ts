import axios from "axios";
import { SyncFailureReason } from "../types";

export class ServiceError extends Error {
  public constructor(
    public readonly reason: SyncFailureReason,
    message: string
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
    if (error.response?.status === 401 || error.response?.status === 403) {
      return new ServiceError("auth_expired", "GitHub authorization expired. Please sign in again.");
    }

    if (error.response?.status === 404) {
      return new ServiceError("source_invalid", "Configured source could not be found.");
    }

    if (error.code === "ECONNABORTED" || !error.response) {
      return new ServiceError("network", "Network error while reaching the skill source.");
    }
  }

  return new ServiceError("unknown", fallbackMessage);
}
