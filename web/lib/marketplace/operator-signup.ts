/**
 * Operator signup helpers: business metadata + idempotent org bootstrap.
 *
 * Traveler signup must not set account_type=operator. Operator signup always
 * stores business_* on user_metadata so a DB trigger can create the
 * marketplace organization even when email confirmation yields no session.
 */

import {
  createOrganization,
  listMyOrganizations,
} from "@/lib/marketplace/client";
import type { Organization } from "@/lib/marketplace/types";
import { canonicalizeRegion } from "@/lib/regions";

export const OPERATOR_ACCOUNT_TYPE = "operator";

export type OperatorBusinessDetails = {
  name: string;
  phone: string;
  website: string;
  region: string;
};

export function normalizeOperatorBusinessDetails(
  input: Partial<OperatorBusinessDetails> | null | undefined
): OperatorBusinessDetails | null {
  if (!input) return null;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const phone = typeof input.phone === "string" ? input.phone.trim() : "";
  const website = typeof input.website === "string" ? input.website.trim() : "";
  const regionRaw =
    typeof input.region === "string" ? input.region.trim() : "";
  const region = canonicalizeRegion(regionRaw) ?? "";
  if (!name || !phone || !website || !region) return null;
  return { name, phone, website, region };
}

/** Auth user_metadata written on operator signUp (also read by DB trigger). */
export function operatorSignupUserMetadata(
  fullName: string,
  business: OperatorBusinessDetails
): Record<string, string> {
  return {
    full_name: fullName.trim(),
    account_type: OPERATOR_ACCOUNT_TYPE,
    business_name: business.name,
    business_phone: business.phone,
    business_website: business.website,
    business_region: business.region,
  };
}

export function isOperatorAccountMetadata(
  meta: Record<string, unknown> | null | undefined
): boolean {
  return meta?.account_type === OPERATOR_ACCOUNT_TYPE;
}

export function businessDetailsFromUserMetadata(
  meta: Record<string, unknown> | null | undefined
): OperatorBusinessDetails | null {
  if (!isOperatorAccountMetadata(meta) || !meta) return null;
  return normalizeOperatorBusinessDetails({
    name:
      typeof meta.business_name === "string" ? meta.business_name : undefined,
    phone:
      typeof meta.business_phone === "string" ? meta.business_phone : undefined,
    website:
      typeof meta.business_website === "string"
        ? meta.business_website
        : undefined,
    region:
      typeof meta.business_region === "string"
        ? meta.business_region
        : undefined,
  });
}

/**
 * Return the user's first org, creating one from explicit business details or
 * operator signup metadata when none exists yet.
 */
export async function ensureOperatorOrganization(
  accessToken: string,
  options?: {
    business?: OperatorBusinessDetails | null;
    userMetadata?: Record<string, unknown> | null;
  }
): Promise<Organization | null> {
  const { organizations } = await listMyOrganizations(accessToken);
  if (organizations.length > 0) {
    return organizations[0] ?? null;
  }

  const details =
    normalizeOperatorBusinessDetails(options?.business) ??
    businessDetailsFromUserMetadata(options?.userMetadata ?? null);
  if (!details) return null;

  const { organization } = await createOrganization(details, accessToken);
  return organization;
}
