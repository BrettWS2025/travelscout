export function formatCurrency(
  amount: number,
  currency = "NZD",
  locale = "en-NZ"
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso?: string | null, locale = "en-NZ") {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short" }).format(d);
}

export function formatDateRange(
  start?: string | null,
  end?: string | null,
  locale = "en-NZ"
) {
  const s = formatDate(start, locale);
  const e = formatDate(end, locale);
  if (s && e) return `${s} – ${e}`;
  return s || e || "";
}
