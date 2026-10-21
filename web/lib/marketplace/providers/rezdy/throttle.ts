/**
 * Shared Rezdy API throttle — 100 calls/minute per API key (spec §7.2).
 * Serialises callers and backs off on 406 Too Many Requests.
 */

const DEFAULT_MAX_PER_MINUTE = 100;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MIN_GAP_MS = Math.ceil(DEFAULT_WINDOW_MS / DEFAULT_MAX_PER_MINUTE);

export type ThrottleOptions = {
  maxPerMinute?: number;
  /** Minimum gap between starts (defaults to window/max). */
  minGapMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type SharedThrottle = {
  /** Wait until a slot is available, then run fn. */
  schedule<T>(fn: () => Promise<T>): Promise<T>;
  /** Record that a rate-limit response was observed (adds extra backoff). */
  noteRateLimited(retryAfterMs?: number): void;
  /** Test helper — clear queue and timestamps. */
  reset(): void;
};

function defaultSleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a throttle keyed externally (one per API key / process).
 */
export function createThrottle(options: ThrottleOptions = {}): SharedThrottle {
  const maxPerMinute = options.maxPerMinute ?? DEFAULT_MAX_PER_MINUTE;
  const windowMs = DEFAULT_WINDOW_MS;
  const minGapMs = options.minGapMs ?? Math.ceil(windowMs / maxPerMinute);
  const nowFn = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;

  const starts: number[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  let extraBackoffUntil = 0;

  function prune(now: number): void {
    while (starts.length > 0 && now - starts[0]! >= windowMs) {
      starts.shift();
    }
  }

  async function waitForSlot(): Promise<void> {
    for (;;) {
      const now = nowFn();
      prune(now);

      const waitForBackoff = Math.max(0, extraBackoffUntil - now);
      const lastStart = starts.length > 0 ? starts[starts.length - 1]! : 0;
      const waitForGap = Math.max(0, lastStart + minGapMs - now);
      const waitForWindow =
        starts.length >= maxPerMinute
          ? Math.max(0, starts[0]! + windowMs - now)
          : 0;

      const waitMs = Math.max(waitForBackoff, waitForGap, waitForWindow);
      if (waitMs <= 0) {
        starts.push(nowFn());
        return;
      }
      await sleep(waitMs);
    }
  }

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      const run = chain.then(async () => {
        await waitForSlot();
        return fn();
      });
      // Keep the chain alive even if fn rejects
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },

    noteRateLimited(retryAfterMs?: number): void {
      const base = retryAfterMs ?? DEFAULT_MIN_GAP_MS * 2;
      // Exponential-ish: at least base, stacked on current backoff
      const now = nowFn();
      const from = Math.max(now, extraBackoffUntil);
      extraBackoffUntil = from + Math.max(base, DEFAULT_MIN_GAP_MS);
    },

    reset(): void {
      starts.length = 0;
      extraBackoffUntil = 0;
      chain = Promise.resolve();
    },
  };
}

/** Process-wide throttles keyed by api key fingerprint (never the raw key). */
const globalThrottles = new Map<string, SharedThrottle>();

export function throttleKeyForApiKey(apiKey: string): string {
  // Short stable fingerprint — do not store the raw key as a Map key in logs.
  let h = 0;
  for (let i = 0; i < apiKey.length; i++) {
    h = (h * 31 + apiKey.charCodeAt(i)) | 0;
  }
  return `rezdy:${apiKey.length}:${h}`;
}

export function getSharedThrottle(
  apiKey: string,
  options?: ThrottleOptions
): SharedThrottle {
  const key = throttleKeyForApiKey(apiKey);
  let t = globalThrottles.get(key);
  if (!t) {
    t = createThrottle(options);
    globalThrottles.set(key, t);
  }
  return t;
}

/** Test helper — drop all process throttles. */
export function resetAllThrottles(): void {
  for (const t of globalThrottles.values()) t.reset();
  globalThrottles.clear();
}
