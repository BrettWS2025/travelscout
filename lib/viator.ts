// lib/viator.ts
// Viator Partner API client library

/**
 * Viator API Configuration
 * Base URL for Viator Partner API
 */
const VIATOR_API_BASE_URL = "https://api.viator.com/partner";

/**
 * Viator Product Types
 */
export type ViatorProduct = {
  productCode: string;
  title: string;
  description?: string;
  images?: Array<{
    variants: Array<{
      url: string;
      width: number;
      height: number;
    }>;
  }>;
  destination?: {
    destinationId: number;
    destinationName: string;
  };
  primaryDestination?: {
    destinationId: number;
    destinationName: string;
  };
  rating?: {
    averageRating: number;
    totalReviews: number;
  };
  pricing?: {
    fromPrice?: number;
    fromPriceFormatted?: string;
    currencyCode?: string;
  };
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  url?: string;
  productUrl?: string;
};

export type ViatorSearchParams = {
  // Location-based search
  destinationId?: number;
  latitude?: number;
  longitude?: number;
  radius?: number; // in kilometers
  
  // Text search
  searchQuery?: string;
  
  // Pagination
  start?: number;
  count?: number; // max 500
  
  // Sorting
  sortBy?: "POPULARITY" | "PRICE" | "RATING" | "DURATION";
  sortOrder?: "ASC" | "DESC";
  
  // Filters
  categoryIds?: number[];
  tagIds?: number[];
  minPrice?: number;
  maxPrice?: number;
  currencyCode?: string; // e.g., "NZD", "USD"
};

export type ViatorSearchResponse = {
  products: ViatorProduct[];
  totalCount: number;
  hasMore: boolean;
};

/**
 * Viator API Client
 */
export class ViatorClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = VIATOR_API_BASE_URL) {
    if (!apiKey) {
      throw new Error("Viator API key is required");
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  /**
   * Make an authenticated request to the Viator API
   */
  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Viator API requires specific Accept header format with version
    // Based on error message, API expects version information in Accept header
    // Also requires Accept-Language header with valid value
    const headers: Record<string, string> = {
      "exp-api-key": this.apiKey,
      "Accept": "application/json;version=2.0",
      "Accept-Language": "en-US", // Required by Viator API
      "Content-Type": "application/json",
    };
    
    // Merge any additional headers from options, but don't override our required ones
    if (options.headers) {
      Object.entries(options.headers).forEach(([key, value]) => {
        if (typeof value === "string" && !["Accept", "Accept-Language", "Content-Type", "exp-api-key"].includes(key)) {
          headers[key] = value;
        }
      });
    }

    // Verbose logging disabled for cleaner output
    // Uncomment for debugging:
    // console.log(`[ViatorClient] Making request to: ${url}`);
    // console.log(`[ViatorClient] Method: ${options.method || "GET"}`);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ViatorClient] API error (${response.status}):`, errorText);
      console.error(`[ViatorClient] Response headers:`, Object.fromEntries(response.headers.entries()));
      
      // Try to parse as JSON for better error messages
      let errorMessage = `Viator API request failed: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = errorJson.message;
        } else if (errorJson.error) {
          errorMessage = errorJson.error;
        }
      } catch {
        // If not JSON, use the text as-is
        if (errorText) {
          errorMessage = `${errorMessage}\nDetails: ${errorText}`;
        }
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return data as T;
  }

  /**
   * Search for products using the /products/search endpoint
   * This is the real-time search model recommended for on-demand queries
   * 
   * Based on Viator Golden Path API structure:
   * - filtering: { destination, tags, flags, prices, dates }
   * - sorting: { sort, order }
   * - pagination: { start, count }
   * - currency: string
   */
  async searchProducts(params: ViatorSearchParams): Promise<ViatorSearchResponse> {
    const body: any = {
      filtering: {},
      sorting: {},
      pagination: {},
    };

    // Filtering - destination is required (as string, not number!)
    if (params.destinationId) {
      body.filtering.destination = String(params.destinationId);
    } else {
      throw new Error("destinationId is required for product search");
    }

    // Filtering - tags
    if (params.tagIds && params.tagIds.length > 0) {
      body.filtering.tags = params.tagIds;
    }

    // Filtering - price range
    if (params.minPrice !== undefined) {
      body.filtering.lowestPrice = params.minPrice;
    }
    if (params.maxPrice !== undefined) {
      body.filtering.highestPrice = params.maxPrice;
    }

    // Sorting - based on example, valid values appear to be PRICE, REVIEW_AVG_RATING, etc.
    // The example shows "PRICE", so let's use that as default and map our values
    if (params.sortBy) {
      // Map our sortBy values to API format
      // Based on error, POPULARITY doesn't exist - trying common alternatives
      const sortMap: Record<string, string> = {
        POPULARITY: "REVIEW_AVG_RATING", // Popularity might map to rating
        PRICE: "PRICE",
        RATING: "REVIEW_AVG_RATING",
        DURATION: "DURATION",
      };
      body.sorting.sort = sortMap[params.sortBy] || "PRICE";
    } else {
      body.sorting.sort = "PRICE"; // Use PRICE as default (from example)
    }

    // Sort order
    if (params.sortOrder) {
      body.sorting.order = params.sortOrder === "ASC" ? "ASCENDING" : "DESCENDING";
    } else {
      body.sorting.order = "DESCENDING";
    }

    // Pagination
    body.pagination.start = (params.start ?? 0) + 1; // API uses 1-based indexing
    body.pagination.count = Math.min(params.count ?? 20, 500); // API limit is 500

    // Currency is required
    body.currency = params.currencyCode || "USD";

    try {
      const response = await this.makeRequest<any>("/products/search", {
        method: "POST",
        body: JSON.stringify(body),
      });

      // Transform the response to our expected format
      const products = response.products || response.data?.products || [];
      const totalCount = response.totalCount || response.data?.totalCount || products.length;
      
      return {
        products,
        totalCount,
        hasMore: products.length >= body.pagination.count,
      };
    } catch (error) {
      console.error("Error searching Viator products:", error);
      throw error;
    }
  }

  // Note: Free-text search endpoint removed - not part of Golden Path
  // Use searchProducts() with destinationId instead

  /**
   * Get a single product by product code
   */
  async getProduct(productCode: string): Promise<ViatorProduct> {
    try {
      const response = await this.makeRequest<any>(`/products/${productCode}`);
      return response;
    } catch (error) {
      console.error(`Error fetching Viator product ${productCode}:`, error);
      throw error;
    }
  }

  /**
   * Get all destinations using /destinations endpoint
   * This is part of the Golden Path - gets details of all destinations
   * Note: The endpoint path may be /destinations or /v1/taxonomy/destinations depending on API version
   */
  async getDestinations(): Promise<any> {
    try {
      // Try the standard endpoint first
      return await this.makeRequest<any>("/destinations");
    } catch (error) {
      // If that fails, try the taxonomy endpoint
      try {
        return await this.makeRequest<any>("/v1/taxonomy/destinations");
      } catch (taxonomyError) {
        console.error("Error fetching Viator destinations from both endpoints:", error, taxonomyError);
        throw error; // Throw the original error
      }
    }
  }

  /**
   * Get all tags using /products/tags endpoint
   * This is part of the Golden Path - gets details for all tags
   */
  async getTags(): Promise<any> {
    try {
      return await this.makeRequest<any>("/products/tags");
    } catch (error) {
      console.error("Error fetching Viator tags:", error);
      throw error;
    }
  }

  /**
   * Get availability schedules for a product
   */
  async getProductAvailability(
    productCode: string,
    options: {
      startDate?: string; // YYYY-MM-DD
      endDate?: string; // YYYY-MM-DD
      currencyCode?: string;
    } = {}
  ): Promise<any> {
    const params = new URLSearchParams();
    if (options.startDate) params.append("startDate", options.startDate);
    if (options.endDate) params.append("endDate", options.endDate);
    if (options.currencyCode) params.append("currencyCode", options.currencyCode);

    const queryString = params.toString();
    const endpoint = `/availability/schedules/${productCode}${queryString ? `?${queryString}` : ""}`;

    try {
      return await this.makeRequest<any>(endpoint);
    } catch (error) {
      console.error(`Error fetching availability for product ${productCode}:`, error);
      throw error;
    }
  }
}

/**
 * Create a Viator client instance using environment variable
 */
export function createViatorClient(): ViatorClient {
  const apiKey = process.env.VIATOR_API_KEY;
  if (!apiKey) {
    throw new Error("VIATOR_API_KEY environment variable is not set");
  }
  return new ViatorClient(apiKey);
}
