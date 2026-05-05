import axios, { AxiosError, AxiosResponse } from "axios";
import { ServiceError, toServiceError } from "./ServiceError";

function axiosError(status: number, headers: Record<string, string> = {}, data: unknown = undefined): AxiosError {
  const response = { status, headers, data, statusText: "", config: {} as AxiosError["config"] } as unknown as AxiosResponse;
  const error = new Error(`Request failed with status code ${status}`) as AxiosError;
  error.isAxiosError = true;
  error.response = response;
  error.config = response.config;
  Object.setPrototypeOf(error, AxiosError.prototype);
  return error;
}

describe("toServiceError", () => {
  beforeAll(() => {
    // Sanity check: axios.isAxiosError sees our crafted errors.
    expect(axios.isAxiosError(axiosError(500))).toBe(true);
  });

  it("classifies HTTP 429 as rate_limited", () => {
    const err = toServiceError(axiosError(429, { "retry-after": "60" }), "fallback");
    expect(err.reason).toBe("rate_limited");
    expect(err.retryAt).toBeInstanceOf(Date);
  });

  it("classifies 403 with x-ratelimit-remaining=0 as rate_limited", () => {
    const reset = Math.floor(Date.now() / 1000) + 120;
    const err = toServiceError(
      axiosError(403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) }),
      "fallback"
    );
    expect(err.reason).toBe("rate_limited");
    expect(err.retryAt?.getTime()).toBe(reset * 1000);
    expect(err.message).toMatch(/rate limit/i);
  });

  it("classifies 403 with rate-limit body message as rate_limited", () => {
    const err = toServiceError(
      axiosError(403, {}, { message: "API rate limit exceeded for user ID 1." }),
      "fallback"
    );
    expect(err.reason).toBe("rate_limited");
  });

  it("treats plain 403 as auth_expired", () => {
    const err = toServiceError(axiosError(403), "fallback");
    expect(err.reason).toBe("auth_expired");
  });

  it("treats 401 as auth_expired", () => {
    const err = toServiceError(axiosError(401), "fallback");
    expect(err.reason).toBe("auth_expired");
  });

  it("treats 404 as source_invalid", () => {
    const err = toServiceError(axiosError(404), "fallback");
    expect(err.reason).toBe("source_invalid");
  });

  it("returns the original ServiceError untouched", () => {
    const original = new ServiceError("rate_limited", "rate", new Date());
    const result = toServiceError(original, "fallback");
    expect(result).toBe(original);
  });

  it("computes retryAt from retry-after delta when reset header is missing", () => {
    const before = Date.now();
    const err = toServiceError(axiosError(429, { "retry-after": "30" }), "fallback");
    const after = Date.now();
    expect(err.retryAt).toBeInstanceOf(Date);
    const ts = err.retryAt?.getTime() ?? 0;
    expect(ts).toBeGreaterThanOrEqual(before + 30_000 - 5);
    expect(ts).toBeLessThanOrEqual(after + 30_000 + 5);
  });
});
