/**
 * UI helpers for auto-deal rules (Chunk 44) — schedule labels, form defaults.
 */

import type { RuleType } from "./enums";

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  specific_dates: "Specific dates",
};

export const DAY_OF_WEEK_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
] as const;

export type DealRuleFormState = {
  name: string;
  integration_id: string;
  external_product_id: string;
  template_deal_id: string;
  rule_type: RuleType;
  days_of_week: number[];
  specific_dates: string;
  session_times: string;
  list_hours_before_start: number;
  min_unsold_seats: number;
  seat_cap: string;
  discount_mechanism: "promo_code" | "price_option" | "separate_product";
  promo_code: string;
  percentage: number;
  external_price_option_id: string;
  auto_publish: boolean;
  is_active: boolean;
  start_date: string;
  end_date: string;
};

export function emptyDealRuleForm(
  defaults?: Partial<DealRuleFormState>
): DealRuleFormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "",
    integration_id: "",
    external_product_id: "",
    template_deal_id: "",
    rule_type: "daily",
    days_of_week: [1, 2, 3, 4, 5],
    specific_dates: "",
    session_times: "",
    list_hours_before_start: 48,
    min_unsold_seats: 2,
    seat_cap: "",
    discount_mechanism: "promo_code",
    promo_code: "",
    percentage: 55,
    external_price_option_id: "",
    auto_publish: false,
    is_active: true,
    start_date: today,
    end_date: "",
    ...defaults,
  };
}

/** Build API body from the editor form. */
export function dealRuleFormToBody(
  form: DealRuleFormState
): Record<string, unknown> {
  const sessionTimes = form.session_times
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const specificDates = form.specific_dates
    .split(/[,\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const seatCap =
    form.seat_cap.trim() === "" ? null : Number.parseInt(form.seat_cap, 10);

  return {
    name: form.name.trim(),
    integration_id: form.integration_id,
    external_product_id: form.external_product_id,
    template_deal_id: form.template_deal_id,
    rule_type: form.rule_type,
    days_of_week: form.rule_type === "weekly" ? form.days_of_week : [],
    specific_dates:
      form.rule_type === "specific_dates" ? specificDates : [],
    session_times: sessionTimes,
    list_hours_before_start: form.list_hours_before_start,
    min_unsold_seats: form.min_unsold_seats,
    seat_cap: Number.isFinite(seatCap) ? seatCap : null,
    discount_mechanism: form.discount_mechanism,
    promo_code:
      form.discount_mechanism === "promo_code"
        ? form.promo_code.trim().toUpperCase() || null
        : null,
    auto_publish: form.auto_publish,
    is_active: form.is_active,
    start_date: form.start_date,
    end_date: form.end_date.trim() || null,
    price_config: {
      options: [
        {
          external_price_option_id: form.external_price_option_id,
          percentage: form.percentage,
        },
      ],
    },
  };
}
