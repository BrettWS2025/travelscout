"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  getWalkingExperiencesByDistrict,
  getWalkingExperiencesNearPoint,
  getWalkingExperiencesByDistricts,
  getWalkingExperiencesNearRoute,
  getDistrictsAlongRoute,
  createStraightLineRoute,
  routeToWKT,
  type WalkingExperience,
} from "@/lib/walkingExperiences";
import { searchPlacesByName, getPlaceDistrictByName } from "@/lib/places";
import { parseDisplayName } from "@/lib/trip-planner/utils";
import {
  fetchViatorProductsForLocation,
  fetchViatorProductsForRoute,
  fetchAllViatorProductsProgressive,
  type ExperienceItem,
} from "@/lib/viator-helpers";
import {
  parseTagMetadata,
  parentTagIdsFromMetadata,
} from "@/lib/viator/tag-metadata";

// Tags to exclude from Viator product searches
// 12044 = "Airport & Hotel Transfers"
// 11945 = "Port Transfers"
// 11937 = "Port Transfers" (variant with trailing space)
// 20238 = "Private Drivers"
const EXCLUDED_TAG_IDS = [12044, 11945, 11937, 20238];

type ThingsToDoResult = {
  walkingExperiences: WalkingExperience[];
  viatorProducts: ExperienceItem[];
};

/**
 * Fetch walking experiences and Viator products for a location
 * Exported for use in prefetching hooks
 */
export async function fetchThingsToDo(location: string): Promise<ThingsToDoResult> {
  const isRoadSector = location.includes(" to ");

  if (isRoadSector) {
    // Road sector: get experiences along the entire route
    const [fromCity, toCity] = location.split(" to ").map((s) => s.trim());

    // Get coordinates for both cities
    const fromPlace = await searchPlacesByName(fromCity, 1);
    const toPlace = await searchPlacesByName(toCity, 1);

    if (
      fromPlace.length > 0 &&
      toPlace.length > 0 &&
      fromPlace[0].lat &&
      fromPlace[0].lng &&
      toPlace[0].lat &&
      toPlace[0].lng
    ) {
      // Create a route with intermediate waypoints
      const routeCoordinates = createStraightLineRoute(
        fromPlace[0].lat,
        fromPlace[0].lng,
        toPlace[0].lat,
        toPlace[0].lng,
        15
      );

      // Convert to WKT
      const routeWkt = routeToWKT(routeCoordinates);

      // Try using route buffer approach first
      let walkingExperiences = await getWalkingExperiencesNearRoute(
        routeWkt,
        30.0,
        500
      );

      if (walkingExperiences.length === 0) {
        // Fallback: Get districts along the route
        const districts = await getDistrictsAlongRoute(routeWkt, 20);
        const fromDistrict = await getPlaceDistrictByName(fromCity);
        const toDistrict = await getPlaceDistrictByName(toCity);

        const allDistricts = Array.from(
          new Set([
            ...districts,
            ...(fromDistrict ? [fromDistrict] : []),
            ...(toDistrict ? [toDistrict] : []),
          ])
        );

        if (allDistricts.length > 0) {
          walkingExperiences = await getWalkingExperiencesByDistricts(
            allDistricts,
            500
          );
        } else {
          // Fallback: query by radius from midpoint
          const midLat = (fromPlace[0].lat + toPlace[0].lat) / 2;
          const midLng = (fromPlace[0].lng + toPlace[0].lng) / 2;
          const distance = Math.sqrt(
            Math.pow((toPlace[0].lat - fromPlace[0].lat) * 111, 2) +
              Math.pow(
                (toPlace[0].lng - fromPlace[0].lng) * 111 *
                  Math.cos((midLat * Math.PI) / 180),
                2
              )
          );

          walkingExperiences = await getWalkingExperiencesNearPoint(
            midLat,
            midLng,
            Math.max(distance / 2, 50.0),
            500
          );
        }
      }

      // Fetch Viator products for the route
      let viatorProducts: ExperienceItem[] = [];
      try {
        const firstPage = await fetchViatorProductsForRoute(
          fromPlace[0].lat,
          fromPlace[0].lng,
          toPlace[0].lat,
          toPlace[0].lng,
          0,
          500,
          fromCity,
          toCity,
          EXCLUDED_TAG_IDS
        );

        viatorProducts = firstPage.products;

        // Load remaining products in background if needed
        if (firstPage.products.length < firstPage.total) {
          const midLat = (fromPlace[0].lat + toPlace[0].lat) / 2;
          const midLng = (fromPlace[0].lng + toPlace[0].lng) / 2;
          const locationName = fromCity || toCity;

          const result = await fetchAllViatorProductsProgressive(
            midLat,
            midLng,
            locationName,
            firstPage.products,
            firstPage.total,
            undefined,
            EXCLUDED_TAG_IDS
          );
          viatorProducts = result.products;
        }
      } catch (viatorError) {
        console.warn("Failed to fetch Viator products for route:", viatorError);
      }

      return { walkingExperiences, viatorProducts };
    } else {
      // Fallback: try to find districts by name only
      const fromDistrict = await getPlaceDistrictByName(fromCity);
      const toDistrict = await getPlaceDistrictByName(toCity);

      const districts = [fromDistrict, toDistrict].filter(
        (d): d is string => d !== null
      );

      if (districts.length > 0) {
        const walkingExperiences = await getWalkingExperiencesByDistricts(
          districts,
          500
        );
        return { walkingExperiences, viatorProducts: [] };
      } else {
        return { walkingExperiences: [], viatorProducts: [] };
      }
    }
  } else {
    // Itinerary sector: single location
    const { cityName, district } = parseDisplayName(location);

    let districtName: string | null = district || null;

    // If no district in display name, try to look it up
    if (!districtName) {
      districtName = await getPlaceDistrictByName(cityName || location);
    }

    let walkingExperiences: WalkingExperience[] = [];

    if (districtName) {
      // Query by district (fastest / preferred)
      walkingExperiences = await getWalkingExperiencesByDistrict(
        districtName,
        500
      );

      if (walkingExperiences.length > 0) {
        // Fetch Viator products for this location
        const places = await searchPlacesByName(cityName || location, 1);
        if (places.length > 0 && places[0].lat && places[0].lng) {
          let viatorProducts: ExperienceItem[] = [];
          try {
            const firstPage = await fetchViatorProductsForLocation(
              places[0].lat,
              places[0].lng,
              60.0,
              0,
              500,
              cityName || location,
              EXCLUDED_TAG_IDS
            );

            viatorProducts = firstPage.products;

            // Load remaining products in background if needed
            if (firstPage.products.length < firstPage.total) {
              const result = await fetchAllViatorProductsProgressive(
                places[0].lat,
                places[0].lng,
                cityName || location,
                firstPage.products,
                firstPage.total,
                undefined,
                EXCLUDED_TAG_IDS
              );
              viatorProducts = result.products;
            }
          } catch (viatorError) {
            console.warn("Failed to fetch Viator products:", viatorError);
          }

          return { walkingExperiences, viatorProducts };
        }
      }
    }

    // Fallback: try to get coordinates and query by radius
    const places = await searchPlacesByName(cityName || location, 1);

    if (places.length > 0 && places[0].lat && places[0].lng) {
      walkingExperiences = await getWalkingExperiencesNearPoint(
        places[0].lat,
        places[0].lng,
        60.0,
        500
      );

      let viatorProducts: ExperienceItem[] = [];
      try {
        const firstPage = await fetchViatorProductsForLocation(
          places[0].lat,
          places[0].lng,
          60.0,
          0,
          500,
          cityName || location,
          EXCLUDED_TAG_IDS
        );

        viatorProducts = firstPage.products;

        // Load remaining products in background if needed
        if (firstPage.products.length < firstPage.total) {
          const result = await fetchAllViatorProductsProgressive(
            places[0].lat,
            places[0].lng,
            cityName || location,
            firstPage.products,
            firstPage.total,
            undefined,
            EXCLUDED_TAG_IDS
          );
          viatorProducts = result.products;
        }
      } catch (viatorError) {
        console.warn("Failed to fetch Viator products:", viatorError);
      }

      return { walkingExperiences, viatorProducts };
    } else {
      return { walkingExperiences: [], viatorProducts: [] };
    }
  }
}

/**
 * Hook to fetch things to do for a location
 */
export function useThingsToDo(location: string) {
  return useQuery({
    queryKey: ["thingsToDo", location],
    queryFn: () => fetchThingsToDo(location),
    enabled: !!location,
  });
}

export type ViatorTag = {
  tag_id: number;
  tag_name: string;
  description?: string;
  category?: string;
  group_name?: string;
  metadata?: {
    parentTagIds?: number[];
    allNamesByLocale?: {
      en?: string;
      [key: string]: string | undefined;
    };
    [key: string]: any;
  };
};

type TagsResult = {
  tags: ViatorTag[];
  childTagToParentsMap: Map<number, number[]>;
};

/**
 * Fetch tags for filtering
 */
async function fetchTags(productTagIds: number[]): Promise<TagsResult> {
  console.log(`[fetchTags] Fetching tags for ${productTagIds.length} product tag IDs:`, productTagIds.slice(0, 20));
  
  // Build API URL with product tag IDs if we have products
  let apiUrl = "/api/viator/tags";
  if (productTagIds.length > 0) {
    const tagIdsParam = productTagIds.join(",");
    apiUrl += `?productTagIds=${encodeURIComponent(tagIdsParam)}`;
  }

  // Parallelize: fetch parent tags and child tags metadata simultaneously
  const [parentTagsResponse, childTagsResponse] = await Promise.all([
    fetch(apiUrl),
    productTagIds.length > 0 
      ? fetch(`/api/viator/tags?tagIds=${productTagIds.join(",")}`)
      : Promise.resolve(null),
  ]);

  if (!parentTagsResponse.ok) {
    const errorData = await parentTagsResponse.json().catch(() => ({}));
    console.error(`[fetchTags] Failed to fetch tags: ${parentTagsResponse.status}`, errorData);
    throw new Error(`Failed to fetch tags: ${parentTagsResponse.status}`);
  }

  const data = await parentTagsResponse.json();
  console.log(`[fetchTags] API response:`, { success: data.success, tagsCount: data.tags?.length || 0, hasTags: !!data.tags });
  
  if (!data.success || !data.tags) {
    console.warn(`[fetchTags] No tags returned. Response:`, data);
    return { tags: [], childTagToParentsMap: new Map() };
  }

  const tags: ViatorTag[] = data.tags;
  console.log(`[fetchTags] Returning ${tags.length} tags:`, tags.slice(0, 5).map(t => ({ id: t.tag_id, name: t.tag_name })));

  // Build child-to-parent mapping
  let childTagToParentsMap = new Map<number, number[]>();

  if (childTagsResponse && childTagsResponse.ok) {
    try {
      const childTagsData = await childTagsResponse.json();
      if (childTagsData.success && childTagsData.allTags) {
        childTagsData.allTags.forEach((tag: any) => {
          const metadata = parseTagMetadata(tag.metadata);
          const parentIds = parentTagIdsFromMetadata(metadata);
          if (parentIds.length > 0) {
            childTagToParentsMap.set(tag.tag_id, parentIds);
          }
        });
      }
    } catch (err) {
      console.error("[useTags] Error fetching child tag metadata:", err);
    }
  }

  return { tags, childTagToParentsMap };
}

/**
 * Hook to fetch tags for filtering
 */
export function useTags(viatorProducts: ExperienceItem[]) {
  // Collect all tag IDs from current products
  const productTagIds = useMemo(() => {
    const ids = viatorProducts
      .flatMap((product) => product.tagIds || [])
      .filter((id): id is number => typeof id === "number");
    
    // Sort and deduplicate
    const uniqueIds = Array.from(new Set(ids)).sort((a, b) => a - b);
    
    // Debug logging
    if (viatorProducts.length > 0) {
      const productsWithTags = viatorProducts.filter(p => p.tagIds && p.tagIds.length > 0);
      console.log(`[useTags] Products: ${viatorProducts.length}, Products with tags: ${productsWithTags.length}, Unique tag IDs: ${uniqueIds.length}`, uniqueIds);
    }
    
    return uniqueIds;
  }, [viatorProducts]);

  const tagIdsKey = useMemo(() => productTagIds.join(","), [productTagIds]);

  return useQuery({
    queryKey: ["viatorTags", tagIdsKey],
    queryFn: async () => {
      const result = await fetchTags(productTagIds);
      console.log(`[useTags] Fetched ${result.tags.length} parent tags from API`);
      return result;
    },
    enabled: productTagIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes - same as other queries
  });
}
