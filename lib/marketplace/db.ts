// lib/marketplace/db.ts
// Supabase access for the marketplace schema (RLS-aware).

import { createClient } from "@supabase/supabase-js";
import type {
  BookingProvider,
  CreateDealInput,
  CreateOrganizationInput,
  Deal,
  DealStatus,
  Organization,
  UpdateDealInput,
} from "./types";

type DbOrganization = {
  id: string;
  name: string;
  slug: string | null;
  website: string | null;
  region: string | null;
  default_booking_provider: BookingProvider;
  fareharbor_shortname: string | null;
  fareharbor_asn: string | null;
  rezdy_affiliate_code: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type DbDeal = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  category: string | null;
  place_id: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  departure_at: string;
  spots_left: number | null;
  original_price: number | null;
  deal_price: number;
  currency: string;
  status: DealStatus;
  booking_provider: BookingProvider;
  booking_url: string | null;
  affiliate_tracking_url: string | null;
  affiliate_asn: string | null;
  affiliate_asn_ref: string | null;
  affiliate_ref: string | null;
  image_url: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  organizations?: { name: string } | { name: string }[] | null;
};

function requireEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Marketplace-scoped client. Pass a user access token so RLS sees auth.uid().
 * For anonymous public reads, omit the token.
 */
export function createMarketplaceClient(accessToken?: string) {
  const { supabaseUrl, supabaseAnonKey } = requireEnv();

  return createClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: "marketplace" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}

export function extractAccessToken(req: Request): string | undefined {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return undefined;
  return authHeader.replace(/^Bearer\s+/i, "").trim() || undefined;
}

function orgFromDb(row: DbOrganization): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug || undefined,
    website: row.website || undefined,
    region: row.region || undefined,
    defaultBookingProvider: row.default_booking_provider,
    fareharborShortname: row.fareharbor_shortname || undefined,
    fareharborAsn: row.fareharbor_asn || undefined,
    rezdyAffiliateCode: row.rezdy_affiliate_code || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function dealFromDb(row: DbDeal): Deal {
  const orgJoin = Array.isArray(row.organizations)
    ? row.organizations[0]
    : row.organizations;

  return {
    id: row.id,
    organizationId: row.organization_id,
    title: row.title,
    description: row.description || undefined,
    category: row.category || undefined,
    placeId: row.place_id || undefined,
    locationName: row.location_name || undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    departureAt: row.departure_at,
    spotsLeft: row.spots_left ?? undefined,
    originalPrice:
      row.original_price == null ? undefined : Number(row.original_price),
    dealPrice: Number(row.deal_price),
    currency: row.currency,
    status: row.status,
    bookingProvider: row.booking_provider,
    bookingUrl: row.booking_url || undefined,
    affiliateTrackingUrl: row.affiliate_tracking_url || undefined,
    affiliateAsn: row.affiliate_asn || undefined,
    affiliateAsnRef: row.affiliate_asn_ref || undefined,
    affiliateRef: row.affiliate_ref || undefined,
    imageUrl: row.image_url || undefined,
    publishedAt: row.published_at || undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    organizationName: orgJoin?.name,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function listMyOrganizations(
  accessToken: string
): Promise<Organization[]> {
  const supabase = createMarketplaceClient(accessToken);
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list organizations: ${error.message}`);
  return (data as DbOrganization[] | null)?.map(orgFromDb) ?? [];
}

export async function getOrganization(
  accessToken: string | undefined,
  organizationId: string
): Promise<Organization | null> {
  const supabase = createMarketplaceClient(accessToken);
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get organization: ${error.message}`);
  return data ? orgFromDb(data as DbOrganization) : null;
}

export async function createOrganization(
  accessToken: string,
  userId: string,
  input: CreateOrganizationInput
): Promise<Organization> {
  const supabase = createMarketplaceClient(accessToken);
  const slug = input.slug?.trim() || slugify(input.name);

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: input.name.trim(),
      slug: slug || null,
      website: input.website?.trim() || null,
      region: input.region?.trim() || null,
      default_booking_provider: input.defaultBookingProvider || "manual",
      fareharbor_shortname: input.fareharborShortname?.trim() || null,
      fareharbor_asn: input.fareharborAsn?.trim() || null,
      rezdy_affiliate_code: input.rezdyAffiliateCode?.trim() || null,
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create organization: ${error.message}`);
  return orgFromDb(data as DbOrganization);
}

export async function listLiveDeals(options?: {
  placeId?: string;
  region?: string;
  limit?: number;
}): Promise<Deal[]> {
  const supabase = createMarketplaceClient();
  let query = supabase
    .from("deals")
    .select("*, organizations(name)")
    .eq("status", "live")
    .order("departure_at", { ascending: true });

  if (options?.placeId) {
    query = query.eq("place_id", options.placeId);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list live deals: ${error.message}`);

  let deals = (data as DbDeal[] | null)?.map(dealFromDb) ?? [];

  // Optional region filter via joined org (PostgREST can't always filter nested easily)
  if (options?.region) {
    const region = options.region.toLowerCase();
    const orgIds = Array.from(new Set(deals.map((d) => d.organizationId)));
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from("organizations")
        .select("id, region")
        .in("id", orgIds);
      const allowed = new Set(
        (orgs || [])
          .filter((o) => (o.region || "").toLowerCase().includes(region))
          .map((o) => o.id)
      );
      deals = deals.filter((d) => allowed.has(d.organizationId));
    }
  }

  return deals;
}

export async function listOrganizationDeals(
  accessToken: string,
  organizationId: string
): Promise<Deal[]> {
  const supabase = createMarketplaceClient(accessToken);
  const { data, error } = await supabase
    .from("deals")
    .select("*")
    .eq("organization_id", organizationId)
    .order("departure_at", { ascending: true });

  if (error) throw new Error(`Failed to list organization deals: ${error.message}`);
  return (data as DbDeal[] | null)?.map(dealFromDb) ?? [];
}

export async function getDeal(
  accessToken: string | undefined,
  dealId: string
): Promise<Deal | null> {
  const supabase = createMarketplaceClient(accessToken);
  const { data, error } = await supabase
    .from("deals")
    .select("*, organizations(name)")
    .eq("id", dealId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get deal: ${error.message}`);
  return data ? dealFromDb(data as DbDeal) : null;
}

export async function createDeal(
  accessToken: string,
  userId: string,
  input: CreateDealInput
): Promise<Deal> {
  const supabase = createMarketplaceClient(accessToken);
  const { data, error } = await supabase
    .from("deals")
    .insert({
      organization_id: input.organizationId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      place_id: input.placeId || null,
      location_name: input.locationName?.trim() || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      departure_at: input.departureAt,
      spots_left: input.spotsLeft ?? null,
      original_price: input.originalPrice ?? null,
      deal_price: input.dealPrice,
      currency: input.currency || "NZD",
      status: input.status || "draft",
      booking_provider: input.bookingProvider || "manual",
      booking_url: input.bookingUrl?.trim() || null,
      affiliate_tracking_url: input.affiliateTrackingUrl?.trim() || null,
      affiliate_asn: input.affiliateAsn?.trim() || null,
      affiliate_asn_ref: input.affiliateAsnRef?.trim() || null,
      affiliate_ref: input.affiliateRef?.trim() || null,
      image_url: input.imageUrl?.trim() || null,
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create deal: ${error.message}`);
  return dealFromDb(data as DbDeal);
}

export async function updateDeal(
  accessToken: string,
  dealId: string,
  input: UpdateDealInput
): Promise<Deal> {
  const supabase = createMarketplaceClient(accessToken);

  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined)
    patch.description = input.description?.trim() || null;
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.placeId !== undefined) patch.place_id = input.placeId || null;
  if (input.locationName !== undefined)
    patch.location_name = input.locationName?.trim() || null;
  if (input.latitude !== undefined) patch.latitude = input.latitude;
  if (input.longitude !== undefined) patch.longitude = input.longitude;
  if (input.departureAt !== undefined) patch.departure_at = input.departureAt;
  if (input.spotsLeft !== undefined) patch.spots_left = input.spotsLeft;
  if (input.originalPrice !== undefined)
    patch.original_price = input.originalPrice;
  if (input.dealPrice !== undefined) patch.deal_price = input.dealPrice;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.status !== undefined) patch.status = input.status;
  if (input.bookingProvider !== undefined)
    patch.booking_provider = input.bookingProvider;
  if (input.bookingUrl !== undefined)
    patch.booking_url = input.bookingUrl?.trim() || null;
  if (input.affiliateTrackingUrl !== undefined)
    patch.affiliate_tracking_url = input.affiliateTrackingUrl?.trim() || null;
  if (input.affiliateAsn !== undefined)
    patch.affiliate_asn = input.affiliateAsn?.trim() || null;
  if (input.affiliateAsnRef !== undefined)
    patch.affiliate_asn_ref = input.affiliateAsnRef?.trim() || null;
  if (input.affiliateRef !== undefined)
    patch.affiliate_ref = input.affiliateRef?.trim() || null;
  if (input.imageUrl !== undefined)
    patch.image_url = input.imageUrl?.trim() || null;

  const { data, error } = await supabase
    .from("deals")
    .update(patch)
    .eq("id", dealId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update deal: ${error.message}`);
  return dealFromDb(data as DbDeal);
}

export async function deleteDeal(
  accessToken: string,
  dealId: string
): Promise<void> {
  const supabase = createMarketplaceClient(accessToken);
  const { error } = await supabase.from("deals").delete().eq("id", dealId);
  if (error) throw new Error(`Failed to delete deal: ${error.message}`);
}

export async function recordDealClick(options: {
  dealId: string;
  destinationUrl: string;
  clickId?: string;
  userId?: string;
  userAgent?: string | null;
  referrer?: string | null;
  accessToken?: string;
}): Promise<{ clickId: string }> {
  const clickId = options.clickId || crypto.randomUUID();
  const supabase = createMarketplaceClient(options.accessToken);
  const { data, error } = await supabase
    .from("deal_clicks")
    .insert({
      deal_id: options.dealId,
      click_id: clickId,
      destination_url: options.destinationUrl,
      user_id: options.userId || null,
      user_agent: options.userAgent || null,
      referrer: options.referrer || null,
    })
    .select("click_id")
    .single();

  if (error) throw new Error(`Failed to record deal click: ${error.message}`);
  return { clickId: (data as { click_id: string }).click_id };
}
