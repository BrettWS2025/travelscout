// lib/viator-helpers.ts
// Helper functions for fetching and transforming Viator products

import type { ViatorProduct } from "./viator";
import type { WalkingExperience } from "./walkingExperiences";

/**
 * Unified type for displaying experiences in the UI
 * Can represent both WalkingExperience and ViatorProduct
 */
export type ExperienceItem = {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  url: string;
  latitude: number | null;
  longitude: number | null;
  type: "walking" | "viator";
  // Walking experience specific fields
  difficulty?: string | null;
  completion_time?: string | null;
  kid_friendly?: boolean;
  distance_km?: number;
  district_name?: string | null;
  // Viator specific fields
  productCode?: string;
  rating?: number;
  totalReviews?: number;
  price?: string;
  currencyCode?: string;
  duration?: string;
  durationInMinutes?: number; // For sorting
  tagIds?: number[]; // Array of tag IDs for filtering
};

/**
 * Transform a WalkingExperience to an ExperienceItem
 */
export function transformWalkingExperience(experience: WalkingExperience): ExperienceItem {
  return {
    id: experience.id,
    title: experience.track_name,
    description: experience.description,
    imageUrl: experience.url_to_thumbnail,
    url: experience.url_to_webpage,
    latitude: experience.latitude,
    longitude: experience.longitude,
    type: "walking",
    difficulty: experience.difficulty,
    completion_time: experience.completion_time,
    kid_friendly: experience.kid_friendly,
    distance_km: experience.distance_km,
    district_name: experience.district_name,
  };
}

/**
 * Transform a ViatorProduct to an ExperienceItem
 */
export function transformViatorProduct(product: ViatorProduct): ExperienceItem {
  // Get the best image URL
  let imageUrl: string | null = null;
  if (product.images && product.images.length > 0) {
    const firstImage = product.images[0];
    if (firstImage.variants && firstImage.variants.length > 0) {
      // Get the largest image variant
      const sortedVariants = [...firstImage.variants].sort(
        (a, b) => (b.width * b.height) - (a.width * a.height)
      );
      imageUrl = sortedVariants[0].url;
    }
  }

  // Get price
  let price: string | undefined;
  if (product.pricing?.fromPriceFormatted) {
    price = product.pricing.fromPriceFormatted;
  } else if (product.pricing?.fromPrice) {
    const currency = product.pricing.currencyCode || product.pricing.currency || "NZD";
    price = `${currency} ${product.pricing.fromPrice.toFixed(2)}`;
  }

  // Get rating
  const rating = product.rating?.averageRating || 
                 product.reviews?.combinedAverageRating || 
                 product.reviews?.averageRating || 
                 product.reviews?.rating;
  const totalReviews = product.rating?.totalReviews || 
                       product.reviews?.totalReviews || 
                       product.reviews?.reviewCount || 
                       product.reviews?.count;

  // Get duration
  let duration: string | undefined;
  let durationInMinutes: number | undefined;
  
  if (typeof product.duration === "string") {
    duration = product.duration;
  } else if (product.duration?.unstructuredDuration) {
    duration = product.duration.unstructuredDuration;
  } else if (product.duration?.fixedDurationInMinutes) {
    durationInMinutes = product.duration.fixedDurationInMinutes;
    const minutes = durationInMinutes;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      duration = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    } else {
      duration = `${mins}m`;
    }
  }
  
  // If we have duration string but not minutes, try to parse it
  if (duration && !durationInMinutes) {
    const durationStr = duration.toLowerCase().trim();
    
    // Try to parse formats like "2 to 60 days", "2-4 days", "3h", "45m", etc.
    const dayMatch = durationStr.match(/(\d+)\s*(?:to|-)\s*(\d+)?\s*d/);
    const hourMatch = durationStr.match(/(\d+)\s*h/);
    const minuteMatch = durationStr.match(/(\d+)\s*m/);
    
    let totalMinutes = 0;
    
    if (dayMatch) {
      // Handle "2 to 60 days" or "2-4 days" - use the minimum for sorting
      const minDays = parseInt(dayMatch[1], 10);
      totalMinutes = minDays * 24 * 60; // Use minimum days
    } else {
      if (hourMatch) {
        totalMinutes += parseInt(hourMatch[1], 10) * 60;
      }
      if (minuteMatch) {
        totalMinutes += parseInt(minuteMatch[1], 10);
      }
    }
    
    if (totalMinutes > 0) {
      durationInMinutes = totalMinutes;
    }
  }

  // Get URL - prefer productUrl, then url
  const url = product.productUrl || product.url || `https://www.viator.com/tours/detail/${product.productCode}`;

  // Extract tag IDs from product
  let tagIds: number[] | undefined;
  if (product.tags) {
    if (Array.isArray(product.tags)) {
      if (product.tags.length > 0) {
        if (typeof product.tags[0] === 'number') {
          // Array of tag IDs
          tagIds = product.tags as number[];
        } else {
          // Array of tag objects
          tagIds = (product.tags as Array<{ tagId: number; tagName?: string }>)
            .map(tag => tag.tagId || (tag as any).id)
            .filter((id): id is number => typeof id === 'number');
        }
      }
    }
  }

  return {
    id: `viator-${product.productCode}`,
    title: product.title,
    description: product.description || null,
    imageUrl,
    url,
    latitude: product.coordinates?.latitude || null,
    longitude: product.coordinates?.longitude || null,
    type: "viator",
    productCode: product.productCode,
    rating: rating ? Number(rating) : undefined,
    totalReviews: totalReviews ? Number(totalReviews) : undefined,
    price,
    currencyCode: product.pricing?.currencyCode || product.pricing?.currency || "NZD",
    duration,
    durationInMinutes,
    tagIds,
  };
}

/**
 * Fetch Viator products for a location
 */
export async function fetchViatorProductsForLocation(
  lat: number,
  lng: number,
  radius: number = 20,
  start: number = 0,
  count: number = 20,
  locationName?: string,
  excludeTagIds?: number[] // Tags to exclude (e.g., [12044] for Airport & Hotel Transfers)
): Promise<{ products: ExperienceItem[]; total: number; hasMore: boolean }> {
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radius.toString(),
      start: start.toString(),
      count: count.toString(),
      sortBy: "POPULARITY",
      sortOrder: "DESC",
      currencyCode: "NZD",
    });
    
    // Add location name if provided (helps with destination ID lookup)
    if (locationName) {
      params.append("locationName", locationName);
    }

    // Add exclude tag IDs if provided
    if (excludeTagIds && excludeTagIds.length > 0) {
      params.append("excludeTagIds", excludeTagIds.join(","));
    }

    const response = await fetch(`/api/viator?${params.toString()}`);
    
    if (!response.ok) {
      console.error("Failed to fetch Viator products:", response.status, response.statusText);
      return { products: [], total: 0, hasMore: false };
    }

    const data = await response.json();
    
    if (data.error) {
      console.error("Viator API error:", data.error);
      return { products: [], total: 0, hasMore: false };
    }

    const products = (data.products || []).map(transformViatorProduct);

    return {
      products,
      total: data.total || data.count || products.length,
      hasMore: data.hasMore || false,
    };
  } catch (error) {
    console.error("Error fetching Viator products:", error);
    return { products: [], total: 0, hasMore: false };
  }
}

/**
 * Prefetch Viator products for a location (for background caching)
 * This can be called when a destination is selected to warm up the cache
 */
export async function prefetchViatorProductsForLocation(
  lat: number,
  lng: number,
  locationName?: string,
  excludeTagIds?: number[]
): Promise<void> {
  try {
    // Just trigger the API call to warm up the cache - don't wait for all pages
    // The cache will be populated by the first request
    await fetchViatorProductsForLocation(lat, lng, 60.0, 0, 500, locationName, excludeTagIds);
  } catch (error) {
    // Silently fail - prefetching is best effort
    console.debug("Prefetch failed (non-critical):", error);
  }
}

/**
 * Fetch Viator products for a route (between two points)
 * Uses the midpoint and a larger radius
 */
export async function fetchViatorProductsForRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  start: number = 0,
  count: number = 20,
  fromLocationName?: string,
  toLocationName?: string,
  excludeTagIds?: number[]
): Promise<{ products: ExperienceItem[]; total: number; hasMore: boolean }> {
  // Calculate midpoint
  const midLat = (fromLat + toLat) / 2;
  const midLng = (fromLng + toLng) / 2;
  
  // Calculate distance and use larger radius
  const distance = Math.sqrt(
    Math.pow((toLat - fromLat) * 111, 2) +
    Math.pow((toLng - fromLng) * 111 * Math.cos(midLat * Math.PI / 180), 2)
  );
  
  const radius = Math.max(distance / 2, 30); // At least 30km radius
  
  // Use the first location name if available
  const locationName = fromLocationName || toLocationName;
  
  return fetchViatorProductsForLocation(midLat, midLng, radius, start, count, locationName, excludeTagIds);
}

/**
 * Fetch all remaining Viator products for a location (assumes first page already fetched)
 * Fetches remaining pages in parallel batches
 */
export async function fetchAllViatorProductsProgressive(
  lat: number,
  lng: number,
  locationName: string | undefined,
  firstPageProducts: ExperienceItem[],
  firstPageTotal: number,
  onProgress?: (current: number, total: number) => void,
  excludeTagIds?: number[]
): Promise<{ products: ExperienceItem[]; total: number }> {
  // If we already have all products, return early
  if (firstPageProducts.length >= firstPageTotal) {
    return {
      products: firstPageProducts,
      total: firstPageTotal,
    };
  }
  
  // Calculate how many pages we need based on first page size
  const productsPerPage = firstPageProducts.length || 50; // Use actual returned count
  const totalPages = Math.ceil(firstPageTotal / productsPerPage);
  
  console.log(`[fetchAllViatorProductsProgressive] Products per page: ${productsPerPage}, Total pages: ${totalPages}, Need to fetch pages 2-${totalPages}`);
  
  // Fetch remaining pages in parallel (batches of 3 to avoid overwhelming the API)
  const allProducts = [...firstPageProducts];
  const seenProductIds = new Set<string>(firstPageProducts.map(p => p.id));
  const batchSize = 3;
  
  for (let batchStart = 1; batchStart < totalPages; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, totalPages);
    const batchPromises: Promise<{ products: ExperienceItem[]; total: number; hasMore: boolean }>[] = [];
    
    console.log(`[fetchAllViatorProductsProgressive] Fetching batch: pages ${batchStart + 1} to ${batchEnd}`);
    
    for (let page = batchStart; page < batchEnd; page++) {
      const pageStart = page * productsPerPage;
      batchPromises.push(
        fetchViatorProductsForLocation(lat, lng, 60.0, pageStart, 500, locationName, excludeTagIds)
      );
    }
    
    // Wait for batch to complete
    const batchResults = await Promise.all(batchPromises);
    
    // Merge results, deduplicating by product ID
    for (const result of batchResults) {
      for (const product of result.products) {
        if (!seenProductIds.has(product.id)) {
          allProducts.push(product);
          seenProductIds.add(product.id);
        } else {
          console.debug(`[fetchAllViatorProductsProgressive] Skipping duplicate product: ${product.id}`);
        }
      }
      onProgress?.(allProducts.length, firstPageTotal);
      
      console.log(`[fetchAllViatorProductsProgressive] Progress: ${allProducts.length}/${firstPageTotal} products loaded`);
      
      // Stop if we have all products
      if (allProducts.length >= firstPageTotal) {
        break;
      }
    }
    
    // Stop if we have all products
    if (allProducts.length >= firstPageTotal) {
      break;
    }
  }
  
  console.log(`[fetchAllViatorProductsProgressive] Complete: ${allProducts.length}/${firstPageTotal} products`);
  
  return {
    products: allProducts,
    total: firstPageTotal,
  };
}
