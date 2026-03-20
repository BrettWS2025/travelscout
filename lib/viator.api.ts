import { supabase } from "@/lib/supabase/client";
import type { ExperienceItem } from "@/lib/viator-helpers";

/**
 * Save a Viator product to the cached_viator_products table
 * Uses INSERT ... ON CONFLICT to prevent duplicates
 * Returns the cached product ID
 */
export async function saveViatorProductToCache(
  product: ExperienceItem
): Promise<{ success: boolean; cachedProductId?: number; error?: string }> {
  try {
    // Only handle Viator products
    if (product.type !== "viator" || !product.productCode) {
      return { success: false, error: "Not a valid Viator product" };
    }

    // Extract destination information if available
    const destinationId = product.destinationId ?? null;
    const destinationName = product.destinationName ?? null;

    // First, check if product already exists
    const { data: existing, error: checkError } = await supabase
      .from("cached_viator_products")
      .select("id")
      .eq("product_code", product.productCode)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 is "not found" which is fine
      console.error("Error checking for existing Viator product:", checkError);
    }

    if (existing) {
      // Product already exists, return its ID
      return { success: true, cachedProductId: existing.id };
    }

    // Parse price from formatted string if needed
    let price: number | null = null;
    if (product.price) {
      // Try to extract numeric value from formatted price (e.g., "NZD $99.00" -> 99.00)
      const priceMatch = product.price.match(/[\d,]+\.?\d*/);
      if (priceMatch) {
        price = parseFloat(priceMatch[0].replace(/,/g, ""));
      }
    }

    // Insert new product
    const { data, error } = await supabase
      .from("cached_viator_products")
      .insert({
        product_code: product.productCode,
        name: product.title,
        description: product.description || null,
        image_url: product.imageUrl || null,
        url: product.url,
        rating: product.rating || null,
        total_reviews: product.totalReviews || null,
        price: price,
        price_formatted: product.price || null,
        currency_code: product.currencyCode || null,
        duration: product.duration || null,
        duration_minutes: product.durationInMinutes || null,
        latitude: product.latitude || null,
        longitude: product.longitude || null,
        destination_id: destinationId,
        destination_name: destinationName,
        tag_ids: product.tagIds || null,
      })
      .select("id")
      .single();

    if (error) {
      // Check if it's a duplicate key error (race condition)
      if (error.code === "23505") {
        // Unique constraint violation - product was inserted by another user
        // Fetch the existing product
        const { data: existingProduct } = await supabase
          .from("cached_viator_products")
          .select("id")
          .eq("product_code", product.productCode)
          .single();

        if (existingProduct) {
          return { success: true, cachedProductId: existingProduct.id };
        }
      }

      return { success: false, error: error.message };
    }

    return { success: true, cachedProductId: data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to save Viator product";
    return { success: false, error: errorMessage };
  }
}

/**
 * Get a cached Viator product by product code
 */
export async function getCachedViatorProduct(
  productCode: string
): Promise<{ success: boolean; product?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("cached_viator_products")
      .select("*")
      .eq("product_code", productCode)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, product: data };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to get Viator product";
    return { success: false, error: errorMessage };
  }
}

/**
 * Get a cached Viator product by cached ID
 */
export async function getCachedViatorProductById(
  cachedId: number
): Promise<{ success: boolean; product?: any; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("cached_viator_products")
      .select("*")
      .eq("id", cachedId)
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, product: data };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Failed to get Viator product";
    return { success: false, error: errorMessage };
  }
}
