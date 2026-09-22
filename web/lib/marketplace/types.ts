// lib/marketplace/types.ts
// Domain types for the last-minute deals marketplace (separate from trip planner).

export type BookingProvider = "manual" | "rezdy" | "fareharbor" | "other";
export type OrgMemberRole = "owner" | "admin" | "staff";
export type DealStatus = "draft" | "live" | "expired" | "sold_out";

export type Organization = {
  id: string;
  name: string;
  slug?: string;
  website?: string;
  region?: string;
  defaultBookingProvider: BookingProvider;
  fareharborShortname?: string;
  fareharborAsn?: string;
  rezdyAffiliateCode?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgMemberRole;
  createdAt: string;
  updatedAt: string;
};

export type Deal = {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  category?: string;
  placeId?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  departureAt: string;
  spotsLeft?: number;
  originalPrice?: number;
  dealPrice: number;
  currency: string;
  status: DealStatus;
  bookingProvider: BookingProvider;
  bookingUrl?: string;
  affiliateTrackingUrl?: string;
  affiliateAsn?: string;
  affiliateAsnRef?: string;
  affiliateRef?: string;
  imageUrl?: string;
  publishedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  /** Optional join when listing public deals */
  organizationName?: string;
};

export type CreateOrganizationInput = {
  name: string;
  slug?: string;
  website?: string;
  region?: string;
  defaultBookingProvider?: BookingProvider;
  fareharborShortname?: string;
  fareharborAsn?: string;
  rezdyAffiliateCode?: string;
};

export type CreateDealInput = {
  organizationId: string;
  title: string;
  description?: string;
  category?: string;
  placeId?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  departureAt: string;
  spotsLeft?: number;
  originalPrice?: number;
  dealPrice: number;
  currency?: string;
  status?: DealStatus;
  bookingProvider?: BookingProvider;
  bookingUrl?: string;
  affiliateTrackingUrl?: string;
  affiliateAsn?: string;
  affiliateAsnRef?: string;
  affiliateRef?: string;
  imageUrl?: string;
};

export type UpdateDealInput = Partial<Omit<CreateDealInput, "organizationId">>;
