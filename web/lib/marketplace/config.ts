/**
 * Platform constants for the deals inventory & settings system.
 * Source of truth: docs/deals-spec.md §1 and docs/build-chunks.md Chunk 1.
 *
 * Defaults are admin-overridable via environment variables of the same name
 * (e.g. MIN_DISCOUNT_PCT=55). Always read via getPlatformConfig() so overrides
 * are respected — never hard-code these numbers elsewhere.
 */

export const PLATFORM_DEFAULTS = {
  MIN_DISCOUNT_PCT: 50,
  MAX_LEAD_HOURS: 72,
  MANUAL_ATTESTATION_HOURS: 12,
  SYNC_STALE_MINUTES: 15,
  CLICK_RECHECK: true,
  MANUAL_REVIEW_COUNT: 3,
  LINK_CHECK_TIMEOUT_MS: 5000,
  CLICK_RECHECK_TIMEOUT_MS: 2000,
  CACHED_AVAILABILITY_MAX_AGE_MINUTES: 5,
  ARCHIVE_AFTER_DAYS: 30,
  ATTESTATION_REMINDER_HOURS: 2,
  ENFORCE_COMPLIANCE_ON_PUBLISH: false,
  DEFAULT_TIMEZONE: "Pacific/Auckland",
  DEFAULT_CURRENCY: "NZD",
} as const;

export type PlatformConfig = {
  MIN_DISCOUNT_PCT: number;
  MAX_LEAD_HOURS: number;
  MANUAL_ATTESTATION_HOURS: number;
  SYNC_STALE_MINUTES: number;
  CLICK_RECHECK: boolean;
  MANUAL_REVIEW_COUNT: number;
  LINK_CHECK_TIMEOUT_MS: number;
  CLICK_RECHECK_TIMEOUT_MS: number;
  CACHED_AVAILABILITY_MAX_AGE_MINUTES: number;
  ARCHIVE_AFTER_DAYS: number;
  ATTESTATION_REMINDER_HOURS: number;
  ENFORCE_COMPLIANCE_ON_PUBLISH: boolean;
  DEFAULT_TIMEZONE: string;
  DEFAULT_CURRENCY: string;
};

function envInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number
): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envBool(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: boolean
): boolean {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function envString(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: string
): string {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  return raw.trim();
}

/** Resolve platform config from env (or a supplied map), falling back to defaults. */
export function getPlatformConfig(
  env: NodeJS.ProcessEnv = process.env
): PlatformConfig {
  const d = PLATFORM_DEFAULTS;
  return {
    MIN_DISCOUNT_PCT: envInt(env, "MIN_DISCOUNT_PCT", d.MIN_DISCOUNT_PCT),
    MAX_LEAD_HOURS: envInt(env, "MAX_LEAD_HOURS", d.MAX_LEAD_HOURS),
    MANUAL_ATTESTATION_HOURS: envInt(
      env,
      "MANUAL_ATTESTATION_HOURS",
      d.MANUAL_ATTESTATION_HOURS
    ),
    SYNC_STALE_MINUTES: envInt(env, "SYNC_STALE_MINUTES", d.SYNC_STALE_MINUTES),
    CLICK_RECHECK: envBool(env, "CLICK_RECHECK", d.CLICK_RECHECK),
    MANUAL_REVIEW_COUNT: envInt(
      env,
      "MANUAL_REVIEW_COUNT",
      d.MANUAL_REVIEW_COUNT
    ),
    LINK_CHECK_TIMEOUT_MS: envInt(
      env,
      "LINK_CHECK_TIMEOUT_MS",
      d.LINK_CHECK_TIMEOUT_MS
    ),
    CLICK_RECHECK_TIMEOUT_MS: envInt(
      env,
      "CLICK_RECHECK_TIMEOUT_MS",
      d.CLICK_RECHECK_TIMEOUT_MS
    ),
    CACHED_AVAILABILITY_MAX_AGE_MINUTES: envInt(
      env,
      "CACHED_AVAILABILITY_MAX_AGE_MINUTES",
      d.CACHED_AVAILABILITY_MAX_AGE_MINUTES
    ),
    ARCHIVE_AFTER_DAYS: envInt(env, "ARCHIVE_AFTER_DAYS", d.ARCHIVE_AFTER_DAYS),
    ATTESTATION_REMINDER_HOURS: envInt(
      env,
      "ATTESTATION_REMINDER_HOURS",
      d.ATTESTATION_REMINDER_HOURS
    ),
    ENFORCE_COMPLIANCE_ON_PUBLISH: envBool(
      env,
      "ENFORCE_COMPLIANCE_ON_PUBLISH",
      d.ENFORCE_COMPLIANCE_ON_PUBLISH
    ),
    DEFAULT_TIMEZONE: envString(env, "DEFAULT_TIMEZONE", d.DEFAULT_TIMEZONE),
    DEFAULT_CURRENCY: envString(env, "DEFAULT_CURRENCY", d.DEFAULT_CURRENCY),
  };
}

/**
 * Spec-named live accessors. Prefer:
 *   const { MIN_DISCOUNT_PCT } = getPlatformConfig();
 * or:
 *   platformConfig.MIN_DISCOUNT_PCT
 */
export const platformConfig: PlatformConfig = {
  get MIN_DISCOUNT_PCT() {
    return getPlatformConfig().MIN_DISCOUNT_PCT;
  },
  get MAX_LEAD_HOURS() {
    return getPlatformConfig().MAX_LEAD_HOURS;
  },
  get MANUAL_ATTESTATION_HOURS() {
    return getPlatformConfig().MANUAL_ATTESTATION_HOURS;
  },
  get SYNC_STALE_MINUTES() {
    return getPlatformConfig().SYNC_STALE_MINUTES;
  },
  get CLICK_RECHECK() {
    return getPlatformConfig().CLICK_RECHECK;
  },
  get MANUAL_REVIEW_COUNT() {
    return getPlatformConfig().MANUAL_REVIEW_COUNT;
  },
  get LINK_CHECK_TIMEOUT_MS() {
    return getPlatformConfig().LINK_CHECK_TIMEOUT_MS;
  },
  get CLICK_RECHECK_TIMEOUT_MS() {
    return getPlatformConfig().CLICK_RECHECK_TIMEOUT_MS;
  },
  get CACHED_AVAILABILITY_MAX_AGE_MINUTES() {
    return getPlatformConfig().CACHED_AVAILABILITY_MAX_AGE_MINUTES;
  },
  get ARCHIVE_AFTER_DAYS() {
    return getPlatformConfig().ARCHIVE_AFTER_DAYS;
  },
  get ATTESTATION_REMINDER_HOURS() {
    return getPlatformConfig().ATTESTATION_REMINDER_HOURS;
  },
  get ENFORCE_COMPLIANCE_ON_PUBLISH() {
    return getPlatformConfig().ENFORCE_COMPLIANCE_ON_PUBLISH;
  },
  get DEFAULT_TIMEZONE() {
    return getPlatformConfig().DEFAULT_TIMEZONE;
  },
  get DEFAULT_CURRENCY() {
    return getPlatformConfig().DEFAULT_CURRENCY;
  },
};

/** Named re-exports matching the spec constant identifiers. */
export const MIN_DISCOUNT_PCT = PLATFORM_DEFAULTS.MIN_DISCOUNT_PCT;
export const MAX_LEAD_HOURS = PLATFORM_DEFAULTS.MAX_LEAD_HOURS;
export const MANUAL_ATTESTATION_HOURS =
  PLATFORM_DEFAULTS.MANUAL_ATTESTATION_HOURS;
export const SYNC_STALE_MINUTES = PLATFORM_DEFAULTS.SYNC_STALE_MINUTES;
export const CLICK_RECHECK = PLATFORM_DEFAULTS.CLICK_RECHECK;
export const MANUAL_REVIEW_COUNT = PLATFORM_DEFAULTS.MANUAL_REVIEW_COUNT;
export const LINK_CHECK_TIMEOUT_MS = PLATFORM_DEFAULTS.LINK_CHECK_TIMEOUT_MS;
export const CLICK_RECHECK_TIMEOUT_MS =
  PLATFORM_DEFAULTS.CLICK_RECHECK_TIMEOUT_MS;
export const CACHED_AVAILABILITY_MAX_AGE_MINUTES =
  PLATFORM_DEFAULTS.CACHED_AVAILABILITY_MAX_AGE_MINUTES;
export const ARCHIVE_AFTER_DAYS = PLATFORM_DEFAULTS.ARCHIVE_AFTER_DAYS;
export const ATTESTATION_REMINDER_HOURS =
  PLATFORM_DEFAULTS.ATTESTATION_REMINDER_HOURS;
export const ENFORCE_COMPLIANCE_ON_PUBLISH =
  PLATFORM_DEFAULTS.ENFORCE_COMPLIANCE_ON_PUBLISH;
export const DEFAULT_TIMEZONE = PLATFORM_DEFAULTS.DEFAULT_TIMEZONE;
export const DEFAULT_CURRENCY = PLATFORM_DEFAULTS.DEFAULT_CURRENCY;
