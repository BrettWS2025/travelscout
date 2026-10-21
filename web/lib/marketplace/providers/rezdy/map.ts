/**
 * Rezdy → normalised marketplace shapes (money = minor units, times = UTC).
 */

import type { PriceOptionType, SessionStatus } from "../../enums";
import type {
  NormalisedPriceOption,
  NormalisedProduct,
  NormalisedSession,
  NormalisedSessionPrice,
} from "../types";
import type {
  RezdyPriceOption,
  RezdyProduct,
  RezdySession,
} from "./types";

/** Convert Rezdy major-unit decimal to integer minor units (cents). */
export function majorToMinor(major: number | null | undefined): number {
  if (major == null || !Number.isFinite(Number(major))) return 0;
  return Math.round(Number(major) * 100);
}

/** Ensure an ISO string ends with Z (UTC). */
export function toUtcIso(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Already ISO with Z or offset
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) return null;
    return new Date(ms).toISOString();
  }
  // Rezdy local format "YYYY-MM-DD HH:mm:ss" — treat as UTC wall only when
  // no timezone is known; callers should prefer startTime (UTC) from the API.
  const localish = trimmed.replace(" ", "T");
  const ms = Date.parse(
    localish.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(localish)
      ? localish
      : `${localish}Z`
  );
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Map Rezdy price option label (+ priceGroupType) → our price_option_type.
 * Spec §7.3 — free-text labels; heuristic then default per_unit.
 */
export function mapPriceOptionType(
  label: string | null | undefined,
  priceGroupType?: string | null
): PriceOptionType {
  const g = (priceGroupType ?? "").trim().toUpperCase();
  if (g && g !== "EACH" && g !== "PRICE") {
    // Shared / group pricing buckets
    if (
      g.includes("GROUP") ||
      g.includes("TOTAL") ||
      g.includes("BOOKING")
    ) {
      return "group";
    }
  }

  const n = (label ?? "").trim().toLowerCase();
  if (!n) return "per_unit";
  if (/\badult\b/.test(n) || n === "adults") return "adult";
  if (/\bchild\b/.test(n) || /\bchildren\b/.test(n) || n === "kids")
    return "child";
  if (/\binfant\b/.test(n) || /\bbaby\b/.test(n) || /\btoddler\b/.test(n))
    return "infant";
  if (/\bsenior\b/.test(n) || /\bpensioner\b/.test(n)) return "senior";
  if (/\bstudent\b/.test(n)) return "student";
  if (/\bfamily\b/.test(n)) return "family";
  if (/\bgroup\b/.test(n) || /\beveryone\b/.test(n) || /\bshared\b/.test(n))
    return "group";
  return "per_unit";
}

export function mapPriceOption(
  option: RezdyPriceOption,
  fallbackCurrency: string
): NormalisedPriceOption | null {
  const id =
    option.id != null
      ? String(option.id)
      : option.label
        ? `label:${option.label}`
        : null;
  if (!id) return null;
  const priceMinor = majorToMinor(option.price);
  if (priceMinor < 0) return null;
  return {
    external_id: id,
    label: (option.label ?? "Option").trim() || "Option",
    type: mapPriceOptionType(option.label, option.priceGroupType),
    price_minor: priceMinor,
    currency: fallbackCurrency,
  };
}

function imageUrls(product: RezdyProduct): string[] {
  const urls: string[] = [];
  for (const img of product.images ?? []) {
    const url =
      img.largeSizeUrl || img.itemUrl || img.mediumSizeUrl || img.thumbnailUrl;
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

function locationFromProduct(
  product: RezdyProduct
): Record<string, unknown> | null {
  const addr = product.locationAddress;
  const lat = product.latitude ?? addr?.latitude ?? null;
  const lng = product.longitude ?? addr?.longitude ?? null;
  const name = addr?.addressLine || addr?.city || null;
  if (lat == null && lng == null && !name && !addr) return null;
  return {
    name: name ?? null,
    address: addr
      ? [addr.addressLine, addr.city, addr.state, addr.postCode, addr.countryCode]
          .filter(Boolean)
          .join(", ")
      : null,
    latitude: lat,
    longitude: lng,
    city: addr?.city ?? null,
    country_code: addr?.countryCode ?? null,
  };
}

/** True when the product should be treated as archived / not bookable. */
export function isProductArchived(product: RezdyProduct): boolean {
  const status = (product.productApiStatus ?? "").toUpperCase();
  if (status === "INACTIVE" || status === "DELETED" || status === "ARCHIVED") {
    return true;
  }
  return false;
}

export function mapProduct(product: RezdyProduct): NormalisedProduct | null {
  const code = product.productCode?.trim();
  if (!code) return null;
  const currency = (product.currency ?? "NZD").toUpperCase().slice(0, 3);
  const priceOptions = (product.priceOptions ?? [])
    .map((po) => mapPriceOption(po, currency))
    .filter((po): po is NormalisedPriceOption => po != null);

  return {
    external_id: code,
    name: (product.name ?? code).trim() || code,
    description:
      product.description?.trim() ||
      product.shortDescription?.trim() ||
      null,
    images: imageUrls(product),
    duration_minutes:
      typeof product.durationMinutes === "number" &&
      Number.isFinite(product.durationMinutes)
        ? Math.round(product.durationMinutes)
        : null,
    location: locationFromProduct(product),
    price_options: priceOptions,
    archived: isProductArchived(product),
  };
}

export function sessionStatusFromSeats(
  seatsAvailable: number,
  cancelled?: boolean
): SessionStatus {
  if (cancelled) return "cancelled";
  if (seatsAvailable <= 0) return "sold_out";
  return "live";
}

export function mapSession(session: RezdySession): NormalisedSession | null {
  if (session.id == null) return null;
  const startAt =
    toUtcIso(session.startTime) ?? toUtcIso(session.startTimeLocal);
  if (!startAt) return null;
  const endAt =
    toUtcIso(session.endTime) ?? toUtcIso(session.endTimeLocal);
  const seatsAvailable = Math.max(
    0,
    Math.floor(Number(session.seatsAvailable ?? 0))
  );
  const totalCapacity =
    session.seats != null && Number.isFinite(Number(session.seats))
      ? Math.max(0, Math.floor(Number(session.seats)))
      : null;
  const currencyGuess = "NZD";
  const prices: NormalisedSessionPrice[] = (session.priceOptions ?? [])
    .map((po) => {
      const id =
        po.id != null ? String(po.id) : po.label ? `label:${po.label}` : null;
      if (!id) return null;
      return {
        external_price_option_id: id,
        price_minor: majorToMinor(po.price),
        currency: currencyGuess,
      };
    })
    .filter((p): p is NormalisedSessionPrice => p != null);

  return {
    external_id: String(session.id),
    start_at: startAt,
    end_at: endAt,
    seats_available: seatsAvailable,
    total_capacity: totalCapacity,
    status: sessionStatusFromSeats(seatsAvailable),
    prices,
  };
}

/** Format a UTC Date as Rezdy `startTime`/`endTime` query value (ISO Z). */
export function toRezdyUtcParam(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
