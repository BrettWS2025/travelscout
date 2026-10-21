/**
 * Client-safe helpers for integrated pricing (Chunk 33).
 *
 * Keep this module free of deal-draft / permissions / supabase server imports
 * so client components (DealEditorSteps) can use it without pulling next/headers.
 */

/** Prefix for separate_product refs in DealPriceOption.externalDealPriceOptionId. */
export const SEPARATE_PRODUCT_REF_PREFIX = "product:" as const;

export type DiscountVerificationStatus =
  | "verified"
  | "not_found"
  | "cannot_verify"
  | "failed";

export type DiscountVerificationOptionResult = {
  price_option_id: string;
  status: DiscountVerificationStatus;
  message?: string;
  actual_price_minor?: number;
};

export type DiscountVerification = {
  status: DiscountVerificationStatus;
  checked_at: string;
  options: DiscountVerificationOptionResult[];
};

export function formatSeparateProductRef(externalProductId: string): string {
  return `${SEPARATE_PRODUCT_REF_PREFIX}${externalProductId}`;
}

export function parseSeparateProductRef(
  value: string | null | undefined
): string | null {
  if (value == null || typeof value !== "string") return null;
  if (!value.startsWith(SEPARATE_PRODUCT_REF_PREFIX)) return null;
  const id = value.slice(SEPARATE_PRODUCT_REF_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export function isSeparateProductRef(value: string | null | undefined): boolean {
  return parseSeparateProductRef(value) != null;
}

function verificationLabel(
  providerName: string,
  status: DiscountVerificationStatus
): string {
  switch (status) {
    case "verified":
      return `Verified in ${providerName}`;
    case "not_found":
      return "Not found";
    case "cannot_verify":
      return "Can't verify; confirm manually";
    case "failed":
      return "Verification failed";
  }
}

export function formatDiscountVerificationStatusText(
  provider: string,
  status: DiscountVerificationStatus | null | undefined
): string {
  if (status == null) return "Not verified yet";
  const name =
    provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
  const display = provider === "rezdy" ? "Rezdy" : name;
  return verificationLabel(display, status);
}
