/**
 * Client-safe labels / formatters for deal stats UI (Chunk 45).
 * Keep free of server-only imports (auth, draft store, adapters).
 */

export function formatCtr(ctr: number): string {
  if (!Number.isFinite(ctr) || ctr <= 0) return "0%";
  return `${(ctr * 100).toFixed(1)}%`;
}

export function formatMoneyMinor(
  amountMinor: number,
  currency: string | null | undefined
): string {
  const code = currency && /^[A-Z]{3}$/i.test(currency) ? currency : "NZD";
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: code,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${code}`;
  }
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-NZ").format(n);
}

import { STATS_METRIC_LABELS as LABELS } from "./display-labels";

export const STATS_METRIC_LABELS = LABELS;
