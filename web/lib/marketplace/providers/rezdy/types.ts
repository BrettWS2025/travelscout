/**
 * Minimal Rezdy Supplier API shapes used by the adapter (Chunk 31 / spec §7).
 * Fields are optional where Rezdy omits them; we only read what we need.
 */

export type RezdyRequestStatus = {
  success?: boolean;
  version?: string;
  error?: {
    errorCode?: string | number;
    errorMessage?: string;
  };
};

export type RezdyPriceOption = {
  id?: number | string;
  label?: string;
  price?: number;
  seatsUsed?: number;
  productCode?: string;
  priceGroupType?: string;
  minQuantity?: number;
  maxQuantity?: number;
};

export type RezdyImage = {
  id?: number;
  itemUrl?: string;
  thumbnailUrl?: string;
  mediumSizeUrl?: string;
  largeSizeUrl?: string;
};

export type RezdyLocationAddress = {
  addressLine?: string;
  city?: string;
  postCode?: string;
  state?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
};

export type RezdyProduct = {
  productCode?: string;
  name?: string;
  shortDescription?: string;
  description?: string;
  productType?: string;
  supplierId?: number | string;
  supplierAlias?: string;
  supplierName?: string;
  timezone?: string;
  currency?: string;
  advertisedPrice?: number;
  priceOptions?: RezdyPriceOption[];
  images?: RezdyImage[];
  durationMinutes?: number;
  latitude?: number;
  longitude?: number;
  locationAddress?: RezdyLocationAddress;
  bookingMode?: string;
  /** Soft-deleted / inactive products may appear as inactive. */
  productApiStatus?: string;
};

export type RezdySession = {
  id?: number | string;
  productCode?: string;
  startTime?: string;
  endTime?: string;
  startTimeLocal?: string;
  endTimeLocal?: string;
  seats?: number;
  seatsAvailable?: number;
  priceOptions?: RezdyPriceOption[];
  allDay?: boolean;
};

export type RezdyProductsResponse = {
  requestStatus?: RezdyRequestStatus;
  products?: RezdyProduct[];
};

export type RezdyAvailabilityResponse = {
  requestStatus?: RezdyRequestStatus;
  sessions?: RezdySession[];
};

export type RezdyQuoteResponse = {
  requestStatus?: RezdyRequestStatus;
  booking?: {
    totalAmount?: number;
    totalCurrency?: string;
    items?: Array<{
      productCode?: string;
      amount?: number;
      subtotal?: number;
      quantities?: Array<{ optionLabel?: string; value?: number }>;
    }>;
    coupon?: string;
  };
};

export type RezdyCredentials = {
  api_key: string;
  /** Override API host (staging vs prod). */
  base_url?: string;
  /** supplierAlias captured on connect for booking URLs. */
  supplier_alias?: string;
  supplier_id?: string;
  supplier_name?: string;
};

export const REZDY_PRODUCTION_BASE = "https://api.rezdy.com/v1";
export const REZDY_STAGING_BASE = "https://api.rezdy-staging.com/v1";
