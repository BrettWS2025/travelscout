/**
 * Auto-deal rules (Chunk 44).
 *
 * CRUD for DealRule, live preview against provider availability, and the
 * every-15-minutes runner that creates integrated_session deals from matching
 * unsold ExternalSessions. Generated deals are independent after creation.
 *
 * Persistence uses the in-memory DealDraftStore until Supabase is wired.
 */

import { getPlatformConfig } from "./config";
import type { Deal, FieldError } from "./deal";
import {
  duplicateDeal,
  ensureUniqueDealSlug,
  slugifyDealTitle,
  type DealDraftStore,
} from "./deal-draft";
import { selectIntegratedSessions } from "./deal-integrated-availability";
import { publishDeal, DealPublishError } from "./deal-publish";
import {
  withDiscountPct,
  type DealPriceOption,
  type DiscountStep,
} from "./deal-session";
import { logDealEvent, type DealActor } from "./deal-status";
import {
  type DealRule,
  type ExternalProduct,
  type ExternalSession,
  type Integration,
  validateDealRuleFields,
} from "./integration";
import {
  INTEGRATED_MECHANISMS,
  isDiscountMechanism,
  isRuleType,
  type DiscountMechanism,
  type RuleType,
} from "./enums";
import { notify } from "./notifications";
import {
  meetsMinDiscount,
  meetsMinDiscountPercentage,
  maxDealPrice,
  priceFromPercentage,
  validateSteps,
  discountPct,
} from "./pricing";
import { getZonedParts, localDateKey } from "./timezone";

// ---------------------------------------------------------------------------
// Errors / constants
// ---------------------------------------------------------------------------

export class DealRulesError extends Error {
  readonly status: number;
  readonly errors?: FieldError[];

  constructor(message: string, status = 400, errors?: FieldError[]) {
    super(message);
    this.name = "DealRulesError";
    this.status = status;
    this.errors = errors;
  }
}

/** Job interval (ms) — every 15 minutes. */
export const DEAL_RULE_RUNNER_INTERVAL_MS = 15 * 60 * 1000;

const ENDED_STATUSES = new Set(["ended", "expired", "archived"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// price_config shapes
// ---------------------------------------------------------------------------

export type DealRulePriceStepConfig = {
  hours_before_start: number;
  deal_price_minor?: number;
  percentage?: number;
  promo_code?: string | null;
  external_deal_price_option_id?: string | null;
};

export type DealRulePriceOptionConfig = {
  /** Matches ExternalProduct / NormalisedPriceOption.external_id */
  external_price_option_id: string;
  deal_price_minor?: number;
  percentage?: number;
  /** For price_option / separate_product mechanisms */
  external_deal_price_option_id?: string | null;
  steps?: DealRulePriceStepConfig[];
};

export type DealRulePriceConfig = {
  options: DealRulePriceOptionConfig[];
};

export function parsePriceConfig(raw: unknown): DealRulePriceConfig {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DealRulesError("price_config must be an object", 400, [
      { field: "price_config", message: "must be an object with options[]" },
    ]);
  }
  const obj = raw as Record<string, unknown>;
  const optionsRaw = obj.options;
  if (!Array.isArray(optionsRaw) || optionsRaw.length === 0) {
    throw new DealRulesError("price_config.options is required", 400, [
      { field: "price_config.options", message: "must be a non-empty array" },
    ]);
  }
  const options: DealRulePriceOptionConfig[] = [];
  for (let i = 0; i < optionsRaw.length; i++) {
    const row = optionsRaw[i];
    if (row == null || typeof row !== "object" || Array.isArray(row)) {
      throw new DealRulesError(
        `price_config.options[${i}] must be an object`,
        400,
        [{ field: `price_config.options[${i}]`, message: "must be an object" }]
      );
    }
    const r = row as Record<string, unknown>;
    const extId = r.external_price_option_id;
    if (typeof extId !== "string" || extId.trim() === "") {
      throw new DealRulesError(
        `price_config.options[${i}].external_price_option_id is required`,
        400,
        [
          {
            field: `price_config.options[${i}].external_price_option_id`,
            message: "required",
          },
        ]
      );
    }
    const hasDeal =
      r.deal_price_minor !== undefined && r.deal_price_minor !== null;
    const hasPct = r.percentage !== undefined && r.percentage !== null;
    if (!hasDeal && !hasPct) {
      throw new DealRulesError(
        `price_config.options[${i}] needs deal_price_minor or percentage`,
        400,
        [
          {
            field: `price_config.options[${i}]`,
            message: "deal_price_minor or percentage required",
          },
        ]
      );
    }
    if (hasDeal) {
      const n = r.deal_price_minor;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0) {
        throw new DealRulesError(
          `price_config.options[${i}].deal_price_minor must be an integer ≥ 0`,
          400,
          [
            {
              field: `price_config.options[${i}].deal_price_minor`,
              message: "must be an integer ≥ 0",
            },
          ]
        );
      }
    }
    if (hasPct) {
      const n = r.percentage;
      if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 100) {
        throw new DealRulesError(
          `price_config.options[${i}].percentage must be 0–100`,
          400,
          [
            {
              field: `price_config.options[${i}].percentage`,
              message: "must be 0–100",
            },
          ]
        );
      }
    }
    const steps: DealRulePriceStepConfig[] = [];
    if (r.steps !== undefined) {
      if (!Array.isArray(r.steps)) {
        throw new DealRulesError(
          `price_config.options[${i}].steps must be an array`,
          400,
          [
            {
              field: `price_config.options[${i}].steps`,
              message: "must be an array",
            },
          ]
        );
      }
      for (let j = 0; j < r.steps.length; j++) {
        const s = r.steps[j] as Record<string, unknown>;
        if (s == null || typeof s !== "object") {
          throw new DealRulesError(
            `price_config.options[${i}].steps[${j}] invalid`,
            400,
            [
              {
                field: `price_config.options[${i}].steps[${j}]`,
                message: "must be an object",
              },
            ]
          );
        }
        const hours = s.hours_before_start;
        if (
          typeof hours !== "number" ||
          !Number.isInteger(hours) ||
          hours < 1
        ) {
          throw new DealRulesError(
            `price_config.options[${i}].steps[${j}].hours_before_start invalid`,
            400,
            [
              {
                field: `price_config.options[${i}].steps[${j}].hours_before_start`,
                message: "must be an integer ≥ 1",
              },
            ]
          );
        }
        steps.push({
          hours_before_start: hours,
          deal_price_minor:
            typeof s.deal_price_minor === "number"
              ? s.deal_price_minor
              : undefined,
          percentage:
            typeof s.percentage === "number" ? s.percentage : undefined,
          promo_code:
            typeof s.promo_code === "string" ? s.promo_code : null,
          external_deal_price_option_id:
            typeof s.external_deal_price_option_id === "string"
              ? s.external_deal_price_option_id
              : null,
        });
      }
    }
    options.push({
      external_price_option_id: extId.trim(),
      deal_price_minor: hasDeal ? (r.deal_price_minor as number) : undefined,
      percentage: hasPct ? (r.percentage as number) : undefined,
      external_deal_price_option_id:
        typeof r.external_deal_price_option_id === "string"
          ? r.external_deal_price_option_id
          : null,
      steps: steps.length > 0 ? steps : undefined,
    });
  }
  return { options };
}

/**
 * Validate price_config against current provider originals (Chunk 10 maths).
 * When providerOptions is empty, only structural + percentage-floor checks run.
 */
export function validatePriceConfigAgainstProvider(
  config: DealRulePriceConfig,
  providerOptions: Array<{ external_id: string; price_minor: number }>
): FieldError[] {
  const errors: FieldError[] = [];
  const byId = new Map(providerOptions.map((p) => [p.external_id, p]));

  for (let i = 0; i < config.options.length; i++) {
    const opt = config.options[i];
    const prefix = `price_config.options[${i}]`;
    const provider = byId.get(opt.external_price_option_id);
    if (providerOptions.length > 0 && !provider) {
      errors.push({
        field: `${prefix}.external_price_option_id`,
        message: `unknown provider option ${opt.external_price_option_id}`,
      });
      continue;
    }
    const original = provider?.price_minor ?? null;
    let dealMinor: number | null = null;
    if (opt.percentage != null) {
      if (!meetsMinDiscountPercentage(opt.percentage)) {
        errors.push({
          field: `${prefix}.percentage`,
          message: `must be ≥ ${getPlatformConfig().MIN_DISCOUNT_PCT}%`,
        });
      } else if (original != null && original > 0) {
        dealMinor = priceFromPercentage(original, opt.percentage);
      }
    }
    if (opt.deal_price_minor != null) {
      dealMinor = opt.deal_price_minor;
      if (original != null && original > 0) {
        if (!meetsMinDiscount(original, opt.deal_price_minor)) {
          errors.push({
            field: `${prefix}.deal_price_minor`,
            message: `must be ≤ ${maxDealPrice(original)} minor units (min ${getPlatformConfig().MIN_DISCOUNT_PCT}% off)`,
          });
        }
      }
    }
    if (opt.steps && opt.steps.length > 0 && original != null && original > 0) {
      const baseDeal =
        dealMinor ??
        (opt.deal_price_minor != null
          ? opt.deal_price_minor
          : opt.percentage != null
            ? priceFromPercentage(original, opt.percentage)
            : 0);
      const stepInputs = opt.steps.map((s) => {
        let stepDeal = s.deal_price_minor;
        if (stepDeal == null && s.percentage != null) {
          stepDeal = priceFromPercentage(original, s.percentage);
        }
        return {
          hoursBeforeStart: s.hours_before_start,
          dealPriceMinor: stepDeal ?? 0,
          promoCode: s.promo_code ?? null,
        };
      });
      // validateSteps expects descending hours
      const sorted = [...stepInputs].sort(
        (a, b) => b.hoursBeforeStart - a.hoursBeforeStart
      );
      for (const e of validateSteps(sorted, {
        originalPriceMinor: original,
        dealPriceMinor: baseDeal,
      })) {
        errors.push({
          field: e.field.startsWith("steps")
            ? `${prefix}.${e.field}`
            : e.field,
          message: e.message,
        });
      }
    }
  }
  return errors;
}

function providerOptionsFromProduct(
  product: ExternalProduct
): Array<{ external_id: string; price_minor: number; label?: string; type?: string }> {
  if (!Array.isArray(product.priceOptions)) return [];
  const out: Array<{
    external_id: string;
    price_minor: number;
    label?: string;
    type?: string;
  }> = [];
  for (const raw of product.priceOptions) {
    if (raw == null || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id =
      typeof o.external_id === "string"
        ? o.external_id
        : typeof o.externalId === "string"
          ? o.externalId
          : null;
    const price =
      typeof o.price_minor === "number"
        ? o.price_minor
        : typeof o.priceMinor === "number"
          ? o.priceMinor
          : null;
    if (id == null || price == null) continue;
    out.push({
      external_id: id,
      price_minor: price,
      label: typeof o.label === "string" ? o.label : undefined,
      type: typeof o.type === "string" ? o.type : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Store helpers
// ---------------------------------------------------------------------------

function ensureDealRulesMap(store: DealDraftStore): Map<string, DealRule> {
  if (!store.dealRules) store.dealRules = new Map();
  return store.dealRules;
}

function requireOperator(store: DealDraftStore, operatorId: string) {
  const op = store.operators.operators.get(operatorId);
  if (!op) throw new DealRulesError("Operator not found", 404);
  return op;
}

function requireRule(
  store: DealDraftStore,
  ruleId: string,
  operatorId?: string
): DealRule {
  const rule = ensureDealRulesMap(store).get(ruleId);
  if (!rule) throw new DealRulesError("Deal rule not found", 404);
  if (operatorId && rule.operatorId !== operatorId) {
    throw new DealRulesError("Deal rule not found", 404);
  }
  return rule;
}

function operatorTimezone(store: DealDraftStore, operatorId: string): string {
  return (
    store.operators.operators.get(operatorId)?.timezone ??
    getPlatformConfig().DEFAULT_TIMEZONE
  );
}

function localHHmm(iso: string, timeZone: string): string {
  const p = getZonedParts(iso, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** JS Sunday=0 … Saturday=6 from zoned parts (Date.UTC day). */
function localDayOfWeek(iso: string, timeZone: string): number {
  const p = getZonedParts(iso, timeZone);
  // Construct a UTC date from local Y-M-D so getUTCDay matches the local calendar day.
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

function isDateInRange(
  localDate: string,
  startDate: string,
  endDate: string | null
): boolean {
  if (localDate < startDate) return false;
  if (endDate != null && localDate > endDate) return false;
  return true;
}

/**
 * Whether the rule's schedule matches "today" in the operator timezone.
 * Used by the runner (active day gate). Preview ignores this so operators
 * can see the next 72 h of potential matches.
 */
export function ruleMatchesLocalDay(
  rule: DealRule,
  nowIso: string,
  timeZone: string
): boolean {
  const today = localDateKey(nowIso, timeZone);
  if (!isDateInRange(today, rule.startDate, rule.endDate)) return false;
  if (rule.ruleType === "daily") return true;
  if (rule.ruleType === "weekly") {
    const dow = localDayOfWeek(nowIso, timeZone);
    return rule.daysOfWeek.includes(dow);
  }
  if (rule.ruleType === "specific_dates") {
    return rule.specificDates.includes(today);
  }
  return false;
}

/**
 * Whether a session's local calendar day matches the rule schedule
 * (for preview / matching within the lead window).
 */
export function sessionMatchesRuleSchedule(
  rule: DealRule,
  sessionStartIso: string,
  timeZone: string
): boolean {
  const localDate = localDateKey(sessionStartIso, timeZone);
  if (!isDateInRange(localDate, rule.startDate, rule.endDate)) return false;
  if (rule.ruleType === "daily") return true;
  if (rule.ruleType === "weekly") {
    const dow = localDayOfWeek(sessionStartIso, timeZone);
    return rule.daysOfWeek.includes(dow);
  }
  if (rule.ruleType === "specific_dates") {
    return rule.specificDates.includes(localDate);
  }
  return false;
}

function sessionMatchesTimes(
  rule: DealRule,
  sessionStartIso: string,
  timeZone: string
): boolean {
  if (!rule.sessionTimes || rule.sessionTimes.length === 0) return true;
  const hhmm = localHHmm(sessionStartIso, timeZone);
  return rule.sessionTimes.includes(hhmm);
}

function hoursUntil(startIso: string, nowIso: string): number {
  return (Date.parse(startIso) - Date.parse(nowIso)) / (60 * 60 * 1000);
}

/**
 * Existing non-ended deal already targeting this external session.
 */
export function hasActiveDealForExternalSession(
  store: DealDraftStore,
  externalSessionId: string
): boolean {
  for (const session of store.sessions.values()) {
    if (session.externalSessionId !== externalSessionId) continue;
    const deal = store.deals.get(session.dealId);
    if (!deal) continue;
    if (ENDED_STATUSES.has(deal.status)) continue;
    return true;
  }
  return false;
}

export type MatchingExternalSession = {
  externalSession: ExternalSession;
  hours_until_start: number;
  local_start: string;
  seats_available: number;
};

/**
 * Find ExternalSessions that would get a deal from this rule right now
 * (or for preview within maxHours — default MAX_LEAD_HOURS).
 *
 * When `requireScheduleMatchToday` is true (runner), also requires the
 * rule's day schedule to match today. Preview uses session-day matching.
 */
export function findMatchingSessionsForRule(
  store: DealDraftStore,
  rule: DealRule,
  options?: {
    now?: string;
    /** Lookahead window; default MAX_LEAD_HOURS for preview. */
    maxHours?: number;
    /** Runner: only list_hours_before_start; preview may use maxHours. */
    useListHoursOnly?: boolean;
    /** Runner day gate (today must match). Default false (preview). */
    requireTodayMatch?: boolean;
  }
): MatchingExternalSession[] {
  const now = options?.now ?? new Date().toISOString();
  const timeZone = operatorTimezone(store, rule.operatorId);
  const { MAX_LEAD_HOURS } = getPlatformConfig();

  if (options?.requireTodayMatch && !ruleMatchesLocalDay(rule, now, timeZone)) {
    return [];
  }

  // Spec: sessions starting in ≤ list_hours_before_start.
  // Preview may further cap with maxHours (default MAX_LEAD_HOURS).
  const listHours = rule.listHoursBeforeStart;
  const lookAhead = options?.useListHoursOnly
    ? listHours
    : (options?.maxHours ?? MAX_LEAD_HOURS);

  const sessions = store.externalSessions ?? new Map();
  const matches: MatchingExternalSession[] = [];

  for (const ext of sessions.values()) {
    if (ext.externalProductId !== rule.externalProductId) continue;
    if (ext.status === "cancelled" || ext.status === "expired") continue;
    const seats = ext.seatsAvailable ?? 0;
    if (seats < rule.minUnsoldSeats) continue;

    const hrs = hoursUntil(ext.startAt, now);
    if (hrs <= 0) continue;
    // Runner: ≤ list_hours. Preview: within lookAhead AND ≤ list_hours
    // (a rule listing 48h before only matches sessions ≤48h out).
    if (hrs > listHours) continue;
    if (!options?.useListHoursOnly && hrs > lookAhead) continue;

    if (!sessionMatchesRuleSchedule(rule, ext.startAt, timeZone)) continue;
    if (!sessionMatchesTimes(rule, ext.startAt, timeZone)) continue;
    if (hasActiveDealForExternalSession(store, ext.id)) continue;

    matches.push({
      externalSession: ext,
      hours_until_start: Math.round(hrs * 10) / 10,
      local_start: `${localDateKey(ext.startAt, timeZone)} ${localHHmm(ext.startAt, timeZone)}`,
      seats_available: seats,
    });
  }

  matches.sort((a, b) =>
    a.externalSession.startAt.localeCompare(b.externalSession.startAt)
  );
  return matches;
}

// ---------------------------------------------------------------------------
// Schedule / discount summary text
// ---------------------------------------------------------------------------

function formatSessionTimesSummary(times: string[]): string {
  if (!times || times.length === 0) return "all sessions";
  const pretty = times.map((t) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
  });
  return `${pretty.join(", ")} sessions`;
}

export function scheduleSummaryText(rule: DealRule): string {
  const hours = `${rule.listHoursBeforeStart} h before`;
  const times = formatSessionTimesSummary(rule.sessionTimes);
  if (rule.ruleType === "daily") {
    return `Daily, ${hours}, ${times}`;
  }
  if (rule.ruleType === "weekly") {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days = [...rule.daysOfWeek]
      .sort((a, b) => a - b)
      .map((d) => names[d] ?? String(d))
      .join("/");
    return `Weekly (${days}), ${hours}, ${times}`;
  }
  const n = rule.specificDates.length;
  return `Specific dates (${n}), ${hours}, ${times}`;
}

export function discountSummaryText(
  rule: DealRule,
  product?: ExternalProduct | null
): string {
  try {
    const config = parsePriceConfig(rule.priceConfig);
    const provider = product ? providerOptionsFromProduct(product) : [];
    const parts: string[] = [];
    for (const opt of config.options) {
      const orig = provider.find(
        (p) => p.external_id === opt.external_price_option_id
      );
      let pct: number | null = null;
      if (opt.percentage != null) {
        pct = opt.percentage;
      } else if (
        opt.deal_price_minor != null &&
        orig &&
        orig.price_minor > 0
      ) {
        pct = discountPct(orig.price_minor, opt.deal_price_minor);
      }
      if (pct != null) parts.push(`${pct}% off`);
      else if (opt.deal_price_minor != null) {
        parts.push(`$${(opt.deal_price_minor / 100).toFixed(2)}`);
      }
    }
    const mech = rule.discountMechanism.replace(/_/g, " ");
    if (parts.length === 0) return mech;
    return `${parts[0]}${parts.length > 1 ? ` (+${parts.length - 1})` : ""} · ${mech}`;
  } catch {
    return rule.discountMechanism.replace(/_/g, " ");
  }
}

function dealsGeneratedLast7Days(
  store: DealDraftStore,
  ruleId: string,
  nowIso: string
): number {
  const cutoff = Date.parse(nowIso) - 7 * 24 * 60 * 60 * 1000;
  let n = 0;
  for (const d of store.deals.values()) {
    if (d.dealRuleId !== ruleId) continue;
    if (Date.parse(d.createdAt) >= cutoff) n += 1;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Serialize / list
// ---------------------------------------------------------------------------

export type DealRuleListRow = {
  id: string;
  name: string;
  product: { id: string; name: string; external_id: string } | null;
  integration_id: string;
  provider: string | null;
  schedule_summary: string;
  discount_summary: string;
  is_active: boolean;
  auto_publish: boolean;
  deals_generated_last_7_days: number;
  next_run_at: string | null;
  last_run_at: string | null;
  rule_type: RuleType;
  list_hours_before_start: number;
  min_unsold_seats: number;
  start_date: string;
  end_date: string | null;
};

export function serializeDealRule(rule: DealRule): Record<string, unknown> {
  return {
    id: rule.id,
    operator_id: rule.operatorId,
    integration_id: rule.integrationId,
    external_product_id: rule.externalProductId,
    name: rule.name,
    is_active: rule.isActive,
    rule_type: rule.ruleType,
    days_of_week: rule.daysOfWeek,
    specific_dates: rule.specificDates,
    session_times: rule.sessionTimes,
    list_hours_before_start: rule.listHoursBeforeStart,
    min_unsold_seats: rule.minUnsoldSeats,
    seat_cap: rule.seatCap,
    price_config: rule.priceConfig,
    discount_mechanism: rule.discountMechanism,
    promo_code: rule.promoCode,
    template_deal_id: rule.templateDealId,
    auto_publish: rule.autoPublish,
    start_date: rule.startDate,
    end_date: rule.endDate,
    last_run_at: rule.lastRunAt,
    next_run_at: rule.nextRunAt,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  };
}

export function listOperatorDealRules(
  store: DealDraftStore,
  operatorId: string,
  options?: { now?: string }
): DealRuleListRow[] {
  requireOperator(store, operatorId);
  const now = options?.now ?? new Date().toISOString();
  const products = store.externalProducts ?? new Map();
  const integrations = store.integrations ?? new Map();
  const rows: DealRuleListRow[] = [];

  for (const rule of ensureDealRulesMap(store).values()) {
    if (rule.operatorId !== operatorId) continue;
    const product = products.get(rule.externalProductId) ?? null;
    const integration = integrations.get(rule.integrationId) ?? null;
    rows.push({
      id: rule.id,
      name: rule.name,
      product: product
        ? {
            id: product.id,
            name: product.name,
            external_id: product.externalId,
          }
        : null,
      integration_id: rule.integrationId,
      provider: integration?.provider ?? null,
      schedule_summary: scheduleSummaryText(rule),
      discount_summary: discountSummaryText(rule, product),
      is_active: rule.isActive,
      auto_publish: rule.autoPublish,
      deals_generated_last_7_days: dealsGeneratedLast7Days(store, rule.id, now),
      next_run_at: rule.nextRunAt,
      last_run_at: rule.lastRunAt,
      rule_type: rule.ruleType,
      list_hours_before_start: rule.listHoursBeforeStart,
      min_unsold_seats: rule.minUnsoldSeats,
      start_date: rule.startDate,
      end_date: rule.endDate,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

export function getDealRule(
  store: DealDraftStore,
  ruleId: string,
  operatorId?: string
): DealRule {
  return requireRule(store, ruleId, operatorId);
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export type CreateDealRuleInput = {
  name: string;
  integration_id: string;
  external_product_id: string;
  rule_type: RuleType;
  days_of_week?: number[];
  specific_dates?: string[];
  session_times?: string[];
  list_hours_before_start: number;
  min_unsold_seats: number;
  seat_cap?: number | null;
  price_config: unknown;
  discount_mechanism: DiscountMechanism;
  promo_code?: string | null;
  template_deal_id: string;
  auto_publish?: boolean;
  is_active?: boolean;
  start_date: string;
  end_date?: string | null;
};

function assertIntegratedProduct(
  store: DealDraftStore,
  operatorId: string,
  integrationId: string,
  productId: string
): { integration: Integration; product: ExternalProduct } {
  const integration = store.integrations?.get(integrationId);
  if (!integration || integration.operatorId !== operatorId) {
    throw new DealRulesError("Integration not found", 404, [
      { field: "integration_id", message: "not found" },
    ]);
  }
  if (
    integration.status !== "connected" &&
    integration.status !== "degraded"
  ) {
    throw new DealRulesError(
      "Integration must be connected for auto-deal rules",
      400,
      [{ field: "integration_id", message: "not connected" }]
    );
  }
  const product = store.externalProducts?.get(productId);
  if (!product || product.integrationId !== integrationId) {
    throw new DealRulesError("External product not found", 404, [
      { field: "external_product_id", message: "not found" },
    ]);
  }
  if (product.archivedInProvider) {
    throw new DealRulesError("Product is archived in the provider", 400, [
      { field: "external_product_id", message: "archived" },
    ]);
  }
  if (!product.isEnabledForDeals) {
    throw new DealRulesError("Product is not enabled for deals", 400, [
      { field: "external_product_id", message: "not enabled" },
    ]);
  }
  return { integration, product };
}

function assertTemplateDeal(
  store: DealDraftStore,
  operatorId: string,
  templateDealId: string,
  productId: string
): Deal {
  const deal = store.deals.get(templateDealId);
  if (!deal || deal.operatorId !== operatorId) {
    throw new DealRulesError("Template deal not found", 404, [
      { field: "template_deal_id", message: "not found" },
    ]);
  }
  if (deal.externalProductId !== productId) {
    throw new DealRulesError(
      "Template deal must be for the same external product",
      400,
      [{ field: "template_deal_id", message: "product mismatch" }]
    );
  }
  if (
    deal.dealType !== "integrated_session" &&
    deal.dealType !== "integrated_multi_session"
  ) {
    throw new DealRulesError(
      "Template deal must be an integrated deal",
      400,
      [{ field: "template_deal_id", message: "must be integrated" }]
    );
  }
  return deal;
}

function normalizeCreateInput(
  raw: Record<string, unknown>
): CreateDealRuleInput {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (raw[k] !== undefined) return raw[k];
    }
    return undefined;
  };

  const name = get("name");
  const ruleType = get("rule_type", "ruleType");
  const listHours = get("list_hours_before_start", "listHoursBeforeStart");
  const minSeats = get("min_unsold_seats", "minUnsoldSeats");
  const mechanism = get("discount_mechanism", "discountMechanism");
  const startDate = get("start_date", "startDate");
  const templateId = get("template_deal_id", "templateDealId");
  const integrationId = get("integration_id", "integrationId");
  const productId = get("external_product_id", "externalProductId");
  const priceConfig = get("price_config", "priceConfig");

  if (typeof name !== "string" || name.trim() === "") {
    throw new DealRulesError("name is required", 400, [
      { field: "name", message: "required" },
    ]);
  }
  if (!isRuleType(ruleType)) {
    throw new DealRulesError("rule_type is invalid", 400, [
      { field: "rule_type", message: "invalid" },
    ]);
  }
  if (typeof listHours !== "number" || !Number.isInteger(listHours)) {
    throw new DealRulesError("list_hours_before_start is required", 400, [
      { field: "list_hours_before_start", message: "required" },
    ]);
  }
  if (typeof minSeats !== "number" || !Number.isInteger(minSeats)) {
    throw new DealRulesError("min_unsold_seats is required", 400, [
      { field: "min_unsold_seats", message: "required" },
    ]);
  }
  if (!isDiscountMechanism(mechanism)) {
    throw new DealRulesError("discount_mechanism is invalid", 400, [
      { field: "discount_mechanism", message: "invalid" },
    ]);
  }
  if (!(INTEGRATED_MECHANISMS as readonly string[]).includes(mechanism)) {
    throw new DealRulesError(
      "discount_mechanism must be an integrated mechanism",
      400,
      [{ field: "discount_mechanism", message: "not valid for auto-deal rules" }]
    );
  }
  if (typeof startDate !== "string" || !DATE_RE.test(startDate)) {
    throw new DealRulesError("start_date must be YYYY-MM-DD", 400, [
      { field: "start_date", message: "YYYY-MM-DD required" },
    ]);
  }
  if (typeof templateId !== "string" || !templateId) {
    throw new DealRulesError("template_deal_id is required", 400, [
      { field: "template_deal_id", message: "required" },
    ]);
  }
  if (typeof integrationId !== "string" || !integrationId) {
    throw new DealRulesError("integration_id is required", 400, [
      { field: "integration_id", message: "required" },
    ]);
  }
  if (typeof productId !== "string" || !productId) {
    throw new DealRulesError("external_product_id is required", 400, [
      { field: "external_product_id", message: "required" },
    ]);
  }

  const endRaw = get("end_date", "endDate");
  let endDate: string | null = null;
  if (endRaw != null && endRaw !== "") {
    if (typeof endRaw !== "string" || !DATE_RE.test(endRaw)) {
      throw new DealRulesError("end_date must be YYYY-MM-DD", 400, [
        { field: "end_date", message: "YYYY-MM-DD" },
      ]);
    }
    endDate = endRaw;
  }

  const daysRaw = get("days_of_week", "daysOfWeek");
  const datesRaw = get("specific_dates", "specificDates");
  const timesRaw = get("session_times", "sessionTimes");
  const seatCapRaw = get("seat_cap", "seatCap");
  const promoRaw = get("promo_code", "promoCode");
  const autoPublish = get("auto_publish", "autoPublish");
  const isActive = get("is_active", "isActive");

  return {
    name: name.trim(),
    integration_id: integrationId,
    external_product_id: productId,
    rule_type: ruleType,
    days_of_week: Array.isArray(daysRaw)
      ? (daysRaw as number[])
      : [],
    specific_dates: Array.isArray(datesRaw)
      ? (datesRaw as string[])
      : [],
    session_times: Array.isArray(timesRaw)
      ? (timesRaw as string[])
      : [],
    list_hours_before_start: listHours,
    min_unsold_seats: minSeats,
    seat_cap:
      seatCapRaw === undefined || seatCapRaw === null
        ? null
        : (seatCapRaw as number),
    price_config: priceConfig,
    discount_mechanism: mechanism,
    promo_code:
      promoRaw === undefined || promoRaw === null
        ? null
        : String(promoRaw),
    template_deal_id: templateId,
    auto_publish: autoPublish === true,
    is_active: isActive === undefined ? true : Boolean(isActive),
    start_date: startDate,
    end_date: endDate,
  };
}

export function createDealRule(
  store: DealDraftStore,
  operatorId: string,
  raw: Record<string, unknown>,
  options?: { now?: string; id?: string }
): DealRule {
  requireOperator(store, operatorId);
  const input = normalizeCreateInput(raw);
  const now = options?.now ?? new Date().toISOString();

  const fieldErrors = validateDealRuleFields({
    name: input.name,
    ruleType: input.rule_type,
    daysOfWeek: input.days_of_week,
    specificDates: input.specific_dates,
    sessionTimes: input.session_times,
    listHoursBeforeStart: input.list_hours_before_start,
    minUnsoldSeats: input.min_unsold_seats,
    seatCap: input.seat_cap,
    discountMechanism: input.discount_mechanism,
    promoCode: input.promo_code,
    startDate: input.start_date,
  });

  const daysOfWeek = input.days_of_week ?? [];
  const specificDates = input.specific_dates ?? [];
  const sessionTimes = input.session_times ?? [];

  if (input.rule_type === "weekly" && daysOfWeek.length === 0) {
    fieldErrors.push({
      field: "days_of_week",
      message: "required for weekly rules",
    });
  }
  if (input.rule_type === "specific_dates" && specificDates.length === 0) {
    fieldErrors.push({
      field: "specific_dates",
      message: "required for specific_dates rules",
    });
  }
  for (const d of specificDates) {
    if (typeof d !== "string" || !DATE_RE.test(d)) {
      fieldErrors.push({
        field: "specific_dates",
        message: "each date must be YYYY-MM-DD",
      });
      break;
    }
  }
  if (
    (input.discount_mechanism === "promo_code" ||
      input.discount_mechanism === "quote_code") &&
    !input.promo_code
  ) {
    fieldErrors.push({
      field: "promo_code",
      message: "required for promo_code mechanism",
    });
  }

  const { product } = assertIntegratedProduct(
    store,
    operatorId,
    input.integration_id,
    input.external_product_id
  );
  assertTemplateDeal(
    store,
    operatorId,
    input.template_deal_id,
    input.external_product_id
  );

  const priceConfig = parsePriceConfig(input.price_config);
  const priceErrors = validatePriceConfigAgainstProvider(
    priceConfig,
    providerOptionsFromProduct(product)
  );
  fieldErrors.push(...priceErrors);

  if (fieldErrors.length > 0) {
    throw new DealRulesError("Invalid deal rule", 400, fieldErrors);
  }

  const id = options?.id ?? crypto.randomUUID();
  const rule: DealRule = {
    id,
    operatorId,
    integrationId: input.integration_id,
    externalProductId: input.external_product_id,
    name: input.name,
    isActive: input.is_active !== false,
    ruleType: input.rule_type,
    daysOfWeek,
    specificDates,
    sessionTimes,
    listHoursBeforeStart: input.list_hours_before_start,
    minUnsoldSeats: input.min_unsold_seats,
    seatCap: input.seat_cap ?? null,
    priceConfig: priceConfig as unknown as Record<string, unknown>,
    discountMechanism: input.discount_mechanism,
    promoCode: input.promo_code ?? null,
    templateDealId: input.template_deal_id,
    autoPublish: input.auto_publish === true,
    startDate: input.start_date,
    endDate: input.end_date ?? null,
    lastRunAt: null,
    nextRunAt: new Date(
      Date.parse(now) + DEAL_RULE_RUNNER_INTERVAL_MS
    ).toISOString(),
    createdAt: now,
    updatedAt: now,
  };

  ensureDealRulesMap(store).set(id, rule);
  return rule;
}

export function updateDealRule(
  store: DealDraftStore,
  operatorId: string,
  ruleId: string,
  raw: Record<string, unknown>,
  options?: { now?: string }
): DealRule {
  const existing = requireRule(store, ruleId, operatorId);
  const now = options?.now ?? new Date().toISOString();

  // Merge patch onto existing serialized shape then re-validate via create path pieces.
  const merged: Record<string, unknown> = {
    name: existing.name,
    integration_id: existing.integrationId,
    external_product_id: existing.externalProductId,
    rule_type: existing.ruleType,
    days_of_week: existing.daysOfWeek,
    specific_dates: existing.specificDates,
    session_times: existing.sessionTimes,
    list_hours_before_start: existing.listHoursBeforeStart,
    min_unsold_seats: existing.minUnsoldSeats,
    seat_cap: existing.seatCap,
    price_config: existing.priceConfig,
    discount_mechanism: existing.discountMechanism,
    promo_code: existing.promoCode,
    template_deal_id: existing.templateDealId,
    auto_publish: existing.autoPublish,
    is_active: existing.isActive,
    start_date: existing.startDate,
    end_date: existing.endDate,
    ...raw,
  };

  // Allow partial toggles without full body.
  const input = normalizeCreateInput(merged);
  const fieldErrors = validateDealRuleFields({
    name: input.name,
    ruleType: input.rule_type,
    daysOfWeek: input.days_of_week,
    specificDates: input.specific_dates,
    sessionTimes: input.session_times,
    listHoursBeforeStart: input.list_hours_before_start,
    minUnsoldSeats: input.min_unsold_seats,
    seatCap: input.seat_cap,
    discountMechanism: input.discount_mechanism,
    promoCode: input.promo_code,
    startDate: input.start_date,
  });

  const daysOfWeek = input.days_of_week ?? [];
  const specificDates = input.specific_dates ?? [];
  const sessionTimes = input.session_times ?? [];

  if (input.rule_type === "weekly" && daysOfWeek.length === 0) {
    fieldErrors.push({
      field: "days_of_week",
      message: "required for weekly rules",
    });
  }
  if (input.rule_type === "specific_dates" && specificDates.length === 0) {
    fieldErrors.push({
      field: "specific_dates",
      message: "required for specific_dates rules",
    });
  }

  const { product } = assertIntegratedProduct(
    store,
    operatorId,
    input.integration_id,
    input.external_product_id
  );
  assertTemplateDeal(
    store,
    operatorId,
    input.template_deal_id,
    input.external_product_id
  );

  const priceConfig = parsePriceConfig(input.price_config);
  fieldErrors.push(
    ...validatePriceConfigAgainstProvider(
      priceConfig,
      providerOptionsFromProduct(product)
    )
  );

  if (fieldErrors.length > 0) {
    throw new DealRulesError("Invalid deal rule", 400, fieldErrors);
  }

  const updated: DealRule = {
    ...existing,
    integrationId: input.integration_id,
    externalProductId: input.external_product_id,
    name: input.name,
    isActive: input.is_active !== false,
    ruleType: input.rule_type,
    daysOfWeek,
    specificDates,
    sessionTimes,
    listHoursBeforeStart: input.list_hours_before_start,
    minUnsoldSeats: input.min_unsold_seats,
    seatCap: input.seat_cap ?? null,
    priceConfig: priceConfig as unknown as Record<string, unknown>,
    discountMechanism: input.discount_mechanism,
    promoCode: input.promo_code ?? null,
    templateDealId: input.template_deal_id,
    autoPublish: input.auto_publish === true,
    startDate: input.start_date,
    endDate: input.end_date ?? null,
    updatedAt: now,
  };

  ensureDealRulesMap(store).set(ruleId, updated);
  return updated;
}

export function deleteDealRule(
  store: DealDraftStore,
  operatorId: string,
  ruleId: string
): void {
  requireRule(store, ruleId, operatorId);
  ensureDealRulesMap(store).delete(ruleId);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export type DealRulePreviewResult = {
  message: string;
  would_create: number;
  provider: string;
  sessions: Array<{
    external_session_id: string;
    external_id: string;
    start_at: string;
    local_start: string;
    seats_available: number;
    hours_until_start: number;
  }>;
};

export function previewDealRule(
  store: DealDraftStore,
  ruleId: string,
  options?: { now?: string; operatorId?: string }
): DealRulePreviewResult {
  const rule = requireRule(store, ruleId, options?.operatorId);
  const now = options?.now ?? new Date().toISOString();
  const { MAX_LEAD_HOURS } = getPlatformConfig();
  const integration = store.integrations?.get(rule.integrationId);
  const provider = integration?.provider ?? "provider";

  const matches = findMatchingSessionsForRule(store, rule, {
    now,
    maxHours: MAX_LEAD_HOURS,
    useListHoursOnly: true,
  });

  const n = matches.length;
  return {
    message: `With current ${provider} availability, this rule would create ${n} deal${n === 1 ? "" : "s"} in the next ${MAX_LEAD_HOURS} hours`,
    would_create: n,
    provider,
    sessions: matches.map((m) => ({
      external_session_id: m.externalSession.id,
      external_id: m.externalSession.externalId,
      start_at: m.externalSession.startAt,
      local_start: m.local_start,
      seats_available: m.seats_available,
      hours_until_start: m.hours_until_start,
    })),
  };
}

// ---------------------------------------------------------------------------
// Create deal from rule + session
// ---------------------------------------------------------------------------

function applyPriceConfigToDeal(
  store: DealDraftStore,
  dealId: string,
  rule: DealRule,
  product: ExternalProduct,
  now: string
): void {
  const config = parsePriceConfig(rule.priceConfig);
  const providerOpts = providerOptionsFromProduct(product);
  const byExt = new Map(providerOpts.map((p) => [p.external_id, p]));

  // Remove existing price options / steps from the duplicated template.
  for (const [id, opt] of [...store.priceOptions.entries()]) {
    if (opt.dealId === dealId) store.priceOptions.delete(id);
  }
  for (const [id, step] of [...store.discountSteps.entries()]) {
    if (step.dealId === dealId) store.discountSteps.delete(id);
  }

  let sortOrder = 0;
  let anySteps = false;

  for (const cfg of config.options) {
    const provider = byExt.get(cfg.external_price_option_id);
    if (!provider) continue;
    const original = provider.price_minor;
    let dealPrice =
      cfg.deal_price_minor ??
      (cfg.percentage != null
        ? priceFromPercentage(original, cfg.percentage)
        : 0);

    const optionId = crypto.randomUUID();
    const option = withDiscountPct({
      id: optionId,
      dealId,
      label: provider.label ?? cfg.external_price_option_id,
      type: (provider.type as DealPriceOption["type"]) ?? "adult",
      externalPriceOptionId: cfg.external_price_option_id,
      externalDealPriceOptionId: cfg.external_deal_price_option_id ?? null,
      originalPriceMinor: original,
      originalPriceSource: "provider" as const,
      originalPriceEvidenceUrl: null,
      dealPriceMinor: dealPrice,
      discountPct: null as number | null,
      sortOrder: sortOrder++,
      createdAt: now,
      updatedAt: now,
    });
    store.priceOptions.set(optionId, option);

    if (cfg.steps && cfg.steps.length > 0) {
      anySteps = true;
      const resolved = cfg.steps.map((s) => {
        const stepDeal =
          s.deal_price_minor ??
          (s.percentage != null
            ? priceFromPercentage(original, s.percentage)
            : dealPrice);
        return {
          hoursBeforeStart: s.hours_before_start,
          dealPriceMinor: stepDeal,
          promoCode: s.promo_code ?? null,
          externalDealPriceOptionId: s.external_deal_price_option_id ?? null,
        };
      });
      resolved.sort((a, b) => b.hoursBeforeStart - a.hoursBeforeStart);
      for (const s of resolved) {
        const step: DiscountStep = {
          id: crypto.randomUUID(),
          dealId,
          priceOptionId: optionId,
          hoursBeforeStart: s.hoursBeforeStart,
          dealPriceMinor: s.dealPriceMinor,
          promoCode: s.promoCode,
          externalDealPriceOptionId: s.externalDealPriceOptionId,
          createdAt: now,
          updatedAt: now,
        };
        store.discountSteps.set(step.id, step);
      }
    }
  }

  const deal = store.deals.get(dealId);
  if (deal && anySteps) {
    store.deals.set(dealId, {
      ...deal,
      steppedDiscountEnabled: true,
      updatedAt: now,
    });
  }
}

/**
 * Copy template content/media without "Copy of" title, set deal_rule_id,
 * apply rule pricing + seat_cap, select the external session.
 */
export async function createDealFromRuleSession(
  store: DealDraftStore,
  rule: DealRule,
  externalSession: ExternalSession,
  options: { actor: DealActor; now?: string; autoPublish?: boolean }
): Promise<{ deal: Deal; published: boolean; publishError?: string }> {
  const now = options.now ?? new Date().toISOString();
  const product = store.externalProducts?.get(rule.externalProductId);
  if (!product) {
    throw new DealRulesError("External product missing for rule", 500);
  }

  // duplicateDeal copies content/media/prices; we then retitle + set rule id.
  const draft = duplicateDeal(store, rule.templateDealId, {
    actor: options.actor,
    now,
  });

  const template = store.deals.get(rule.templateDealId)!;
  const title =
    template.title ?? draft.title?.replace(/^Copy of\s+/i, "") ?? null;

  let deal = store.deals.get(draft.id)!;
  deal = {
    ...deal,
    title,
    dealRuleId: rule.id,
    dealType: "integrated_session",
    integrationId: rule.integrationId,
    externalProductId: rule.externalProductId,
    discountMechanism: rule.discountMechanism,
    promoCode: rule.promoCode,
    seatCap: rule.seatCap,
    capacityMode:
      rule.seatCap != null ? "live_provider_capped" : "live_provider",
    updatedAt: now,
  };
  if (title) {
    deal = {
      ...deal,
      slug: ensureUniqueDealSlug(store, slugifyDealTitle(title), deal.id),
    };
  }
  store.deals.set(deal.id, deal);

  applyPriceConfigToDeal(store, deal.id, rule, product, now);

  await selectIntegratedSessions(
    store,
    deal.id,
    { external_session_ids: [externalSession.id] },
    { actor: options.actor, now, confirm: true }
  );

  logDealEvent(
    store.audit,
    deal.id,
    "updated",
    options.actor,
    { from_rule: rule.id, external_session_id: externalSession.id },
    { now }
  );

  let published = false;
  let publishError: string | undefined;
  const shouldPublish = options.autoPublish ?? rule.autoPublish;
  if (shouldPublish) {
    try {
      // Integrated publish does not need attest.
      await publishDeal(store, deal.id, {
        actor: options.actor,
        now,
        fetchFn: undefined,
      });
      published = true;
    } catch (err) {
      publishError =
        err instanceof DealPublishError
          ? err.message
          : err instanceof Error
            ? err.message
            : "publish failed";
      // Leave as draft — independent of the rule.
    }
  }

  return { deal: store.deals.get(deal.id)!, published, publishError };
}

// ---------------------------------------------------------------------------
// Runner job
// ---------------------------------------------------------------------------

export type RunDealRulesJobResult = {
  rules_evaluated: number;
  deals_created: number;
  deals_published: number;
  by_rule: Array<{
    rule_id: string;
    created: number;
    published: number;
    skipped_existing: number;
  }>;
};

export async function runDealRulesJob(
  store: DealDraftStore,
  options?: { now?: string; actor?: DealActor }
): Promise<RunDealRulesJobResult> {
  const now = options?.now ?? new Date().toISOString();
  const actor: DealActor = options?.actor ?? { type: "system", id: null };
  const nextRun = new Date(
    Date.parse(now) + DEAL_RULE_RUNNER_INTERVAL_MS
  ).toISOString();

  const result: RunDealRulesJobResult = {
    rules_evaluated: 0,
    deals_created: 0,
    deals_published: 0,
    by_rule: [],
  };

  for (const rule of [...ensureDealRulesMap(store).values()]) {
    if (!rule.isActive) continue;

    const timeZone = operatorTimezone(store, rule.operatorId);
    if (!ruleMatchesLocalDay(rule, now, timeZone)) {
      // Still advance next_run_at so the schedule stays honest.
      ensureDealRulesMap(store).set(rule.id, {
        ...rule,
        nextRunAt: nextRun,
        updatedAt: now,
      });
      continue;
    }

    result.rules_evaluated += 1;
    const matches = findMatchingSessionsForRule(store, rule, {
      now,
      useListHoursOnly: true,
      requireTodayMatch: true,
    });

    let created = 0;
    let published = 0;
    for (const match of matches) {
      // Re-check — prior iteration may have created a deal for this session.
      if (hasActiveDealForExternalSession(store, match.externalSession.id)) {
        continue;
      }
      const out = await createDealFromRuleSession(
        store,
        rule,
        match.externalSession,
        { actor, now }
      );
      created += 1;
      if (out.published) published += 1;
    }

    ensureDealRulesMap(store).set(rule.id, {
      ...rule,
      lastRunAt: now,
      nextRunAt: nextRun,
      updatedAt: now,
    });

    result.deals_created += created;
    result.deals_published += published;
    result.by_rule.push({
      rule_id: rule.id,
      created,
      published,
      skipped_existing: 0,
    });

    if (created > 0) {
      await notify(
        store,
        rule.operatorId,
        "auto_rule_created_deals",
        {
          rule_id: rule.id,
          rule_name: rule.name,
          created,
          published,
        },
        {
          now,
          incidentKey: `auto_rule_created_deals:${rule.id}:${now}`,
          title: "Auto-deal rule created deals",
          body: `${rule.name} created ${created} deal${created === 1 ? "" : "s"}${published > 0 ? ` (${published} published)` : ""}.`,
        }
      );
    }
  }

  return result;
}

/** Seed helper for tests. */
export function seedDealRule(
  store: DealDraftStore,
  rule: DealRule
): DealRule {
  ensureDealRulesMap(store).set(rule.id, rule);
  return rule;
}
