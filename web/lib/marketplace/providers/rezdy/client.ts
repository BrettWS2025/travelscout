/**
 * Rezdy Supplier API HTTP client — apiKey header, throttle, 406 backoff.
 */

import { AdapterOperationError } from "../errors";
import {
  getSharedThrottle,
  type SharedThrottle,
  type ThrottleOptions,
} from "./throttle";
import {
  REZDY_PRODUCTION_BASE,
  type RezdyAvailabilityResponse,
  type RezdyBookingsResponse,
  type RezdyCredentials,
  type RezdyProductsResponse,
  type RezdyQuoteResponse,
  type RezdyRequestStatus,
} from "./types";

export type RezdyFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type RezdyClientOptions = {
  credentials: RezdyCredentials;
  fetchFn?: RezdyFetch;
  throttle?: SharedThrottle;
  throttleOptions?: ThrottleOptions;
  /** Max retries after 406 / transient 5xx. */
  maxRetries?: number;
};

export type RezdyClient = {
  credentials: RezdyCredentials;
  baseUrl: string;
  getProducts(params?: {
    offset?: number;
    limit?: number;
    timeoutMs?: number;
  }): Promise<RezdyProductsResponse>;
  getAvailability(params: {
    productCodes: string[];
    from: Date;
    to: Date;
    timeoutMs?: number;
  }): Promise<RezdyAvailabilityResponse>;
  postQuote(
    body: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<RezdyQuoteResponse>;
  getBookings(params: {
    from: Date;
    to: Date;
    offset?: number;
    limit?: number;
    timeoutMs?: number;
  }): Promise<RezdyBookingsResponse>;
};

function providerError(
  code: string,
  message: string
): AdapterOperationError {
  return new AdapterOperationError("rezdy", code, message);
}

function resolveBaseUrl(credentials: RezdyCredentials): string {
  const raw = (credentials.base_url ?? REZDY_PRODUCTION_BASE).replace(/\/$/, "");
  return raw.endsWith("/v1") ? raw : `${raw}/v1`;
}

function statusErrorMessage(status: RezdyRequestStatus | undefined): string {
  const err = status?.error;
  if (err?.errorMessage) return String(err.errorMessage);
  if (err?.errorCode != null) return `Rezdy error ${err.errorCode}`;
  return "Rezdy request failed";
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw providerError(
      "invalid_json",
      `Rezdy returned non-JSON (HTTP ${res.status})`
    );
  }
}

export function createRezdyClient(options: RezdyClientOptions): RezdyClient {
  const { credentials } = options;
  const apiKey = credentials.api_key;
  if (!apiKey) {
    throw providerError("invalid_credentials", "Missing Rezdy API key");
  }

  const baseUrl = resolveBaseUrl(credentials);
  const fetchFn: RezdyFetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  const throttle =
    options.throttle ??
    getSharedThrottle(apiKey, options.throttleOptions);
  const maxRetries = options.maxRetries ?? 3;

  async function request<T extends { requestStatus?: RezdyRequestStatus }>(
    method: string,
    pathAndQuery: string,
    init?: {
      body?: unknown;
      timeoutMs?: number;
    }
  ): Promise<T> {
    const url = pathAndQuery.startsWith("http")
      ? pathAndQuery
      : `${baseUrl}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      attempt += 1;
      try {
        const result = await throttle.schedule(async () => {
          const controller = new AbortController();
          const timeoutMs = init?.timeoutMs;
          let timer: ReturnType<typeof setTimeout> | undefined;
          if (timeoutMs != null && timeoutMs > 0) {
            timer = setTimeout(() => controller.abort(), timeoutMs);
          }
          try {
            const res = await fetchFn(url, {
              method,
              headers: {
                apiKey,
                Accept: "application/json",
                ...(init?.body
                  ? { "Content-Type": "application/json" }
                  : {}),
              },
              body: init?.body != null ? JSON.stringify(init.body) : undefined,
              signal: controller.signal,
            });

            if (res.status === 406) {
              throttle.noteRateLimited(1_000 * attempt);
              throw providerError(
                "rate_limited",
                "Too Many Requests (Rezdy rate limit)"
              );
            }

            const json = (await parseJson(res)) as T;
            if (!res.ok) {
              throw providerError(
                `http_${res.status}`,
                statusErrorMessage(json.requestStatus) ||
                  `Rezdy HTTP ${res.status}`
              );
            }
            if (json.requestStatus && json.requestStatus.success === false) {
              throw providerError(
                "api_error",
                statusErrorMessage(json.requestStatus)
              );
            }
            return json;
          } finally {
            if (timer) clearTimeout(timer);
          }
        });
        return result;
      } catch (err) {
        lastError = err;
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || /aborted/i.test(err.message));
        if (isAbort) {
          throw providerError(
            "timeout",
            `Availability check timed out after ${init?.timeoutMs ?? "?"}ms`
          );
        }
        const isRate =
          err instanceof AdapterOperationError && err.code === "rate_limited";
        const isTransient =
          err instanceof AdapterOperationError &&
          /^http_5\d\d$/.test(err.code);
        if ((isRate || isTransient) && attempt <= maxRetries) {
          continue;
        }
        throw err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : providerError("request_failed", "Rezdy request failed");
  }

  return {
    credentials,
    baseUrl,

    async getProducts(params = {}) {
      const offset = params.offset ?? 0;
      const limit = Math.min(params.limit ?? 100, 100);
      const q = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
      });
      return request<RezdyProductsResponse>("GET", `/products?${q}`, {
        timeoutMs: params.timeoutMs,
      });
    },

    async getAvailability(params) {
      const q = new URLSearchParams();
      for (const code of params.productCodes) {
        q.append("productCode", code);
      }
      // UTC start/end — Supplier API accepts these (spec §7.3).
      q.set("startTime", params.from.toISOString());
      q.set("endTime", params.to.toISOString());
      return request<RezdyAvailabilityResponse>(
        "GET",
        `/availability?${q}`,
        { timeoutMs: params.timeoutMs }
      );
    },

    async postQuote(body, options) {
      return request<RezdyQuoteResponse>("POST", `/bookings/quote`, {
        body,
        timeoutMs: options?.timeoutMs,
      });
    },

    async getBookings(params) {
      const offset = params.offset ?? 0;
      const limit = Math.min(params.limit ?? 100, 100);
      const q = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        // Supplier API date filters (UTC) — see spec §7.7.
        minDate: params.from.toISOString(),
        maxDate: params.to.toISOString(),
      });
      return request<RezdyBookingsResponse>("GET", `/bookings?${q}`, {
        timeoutMs: params.timeoutMs,
      });
    },
  };
}

export function parseCredentialsJson(raw: string): RezdyCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw providerError(
      "invalid_credentials",
      "Stored Rezdy credentials are not valid JSON"
    );
  }
  if (!parsed || typeof parsed !== "object") {
    throw providerError("invalid_credentials", "Invalid Rezdy credentials");
  }
  const obj = parsed as Record<string, unknown>;
  const apiKey =
    typeof obj.api_key === "string"
      ? obj.api_key
      : typeof obj.apiKey === "string"
        ? obj.apiKey
        : null;
  if (!apiKey?.trim()) {
    throw providerError("invalid_credentials", "Rezdy credentials missing api_key");
  }
  return {
    api_key: apiKey.trim(),
    base_url: typeof obj.base_url === "string" ? obj.base_url : undefined,
    supplier_alias:
      typeof obj.supplier_alias === "string" ? obj.supplier_alias : undefined,
    supplier_id:
      typeof obj.supplier_id === "string" ? obj.supplier_id : undefined,
    supplier_name:
      typeof obj.supplier_name === "string" ? obj.supplier_name : undefined,
  };
}
