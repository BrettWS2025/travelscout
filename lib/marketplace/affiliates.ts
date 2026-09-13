// lib/marketplace/affiliates.ts
// Build attributed booking redirect URLs for marketplace deals.

import type { Deal, Organization } from "./types";

function appendParams(baseUrl: string, params: Record<string, string | undefined>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * Choose the destination booking URL and stamp affiliate / click attribution.
 */
export function buildDealRedirectUrl(
  deal: Deal,
  clickId: string,
  organization?: Pick<
    Organization,
    "fareharborShortname" | "fareharborAsn" | "rezdyAffiliateCode"
  > | null
): string {
  const base =
    deal.affiliateTrackingUrl?.trim() ||
    deal.bookingUrl?.trim();

  if (!base) {
    throw new Error("Deal has no booking_url or affiliate_tracking_url");
  }

  const provider = deal.bookingProvider;
  const asn = deal.affiliateAsn || organization?.fareharborAsn;
  const asnRef = deal.affiliateAsnRef || clickId;
  const ref = deal.affiliateRef || "travelscout";

  if (provider === "fareharbor") {
    return appendParams(base, {
      asn: asn,
      asnRef,
      ref,
      // FareHarbor shortname is often already in the path; keep as query fallback
      shortname: organization?.fareharborShortname,
      click_id: clickId,
    });
  }

  if (provider === "rezdy") {
    return appendParams(base, {
      ref,
      click_id: clickId,
      resellerReference: clickId,
      // Prefer operator-provided affiliate code when present
      ...(organization?.rezdyAffiliateCode
        ? { affiliate: organization.rezdyAffiliateCode }
        : {}),
    });
  }

  // manual / other
  return appendParams(base, {
    ref,
    click_id: clickId,
    utm_source: "travelscout",
    utm_medium: "last_minute_deal",
  });
}
