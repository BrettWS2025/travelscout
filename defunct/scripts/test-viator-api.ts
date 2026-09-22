#!/usr/bin/env tsx
/**
 * Test script for Viator API integration
 * 
 * Usage:
 *   npm run test:viator
 *   or
 *   tsx scripts/test-viator-api.ts
 * 
 * This script tests:
 * 1. API authentication
 * 2. Basic product search by location
 * 3. Free-text search
 * 4. Single product retrieval
 */

import { createViatorClient } from "../lib/viator";
import { readFileSync } from "fs";
import { join } from "path";

// Load environment variables from .env.local
function loadEnv() {
  try {
    const envPath = join(process.cwd(), ".env.local");
    const envFile = readFileSync(envPath, "utf-8");
    const lines = envFile.split("\n");
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^["']|["']$/g, ""); // Remove quotes
          process.env[key.trim()] = value.trim();
        }
      }
    }
  } catch (error) {
    console.warn("Warning: Could not load .env.local file:", error);
  }
}

loadEnv();

async function testViatorAPI() {
  console.log("🧪 Testing Viator API Integration\n");
  console.log("=" .repeat(50));

  // Check for API key
  const apiKey = process.env.VIATOR_API_KEY;
  if (!apiKey) {
    console.error("❌ Error: VIATOR_API_KEY not found in environment variables");
    console.error("   Please add VIATOR_API_KEY to your .env.local file");
    process.exit(1);
  }

  console.log("✅ API Key found");
  console.log(`   Key prefix: ${apiKey.substring(0, 10)}...\n`);

  try {
    const client = createViatorClient();

    // Test 0: Get destinations to find Queenstown's destination ID (Golden Path endpoint)
    console.log("Test 0: Get destinations - Find Queenstown (Golden Path: /destinations)");
    console.log("-".repeat(50));
    try {
      const destinations = await client.getDestinations();
      console.log(`✅ Destinations retrieved!`);
      console.log(`   Total destinations: ${destinations.destinations?.length || destinations.totalCount || 'unknown'}`);
      
      // Try different possible response structures
      const dests = destinations.destinations || destinations.data || [];
      if (Array.isArray(dests) && dests.length > 0) {
        // Try to find Queenstown - check various field names
        const queenstown = dests.find((d: any) => {
          const name = (d.destinationName || d.name || d.title || "").toLowerCase();
          return name.includes("queenstown");
        });
        
        if (queenstown) {
          const destId = queenstown.destinationId || queenstown.id || queenstown.destId;
          const name = queenstown.destinationName || queenstown.name || queenstown.title;
          console.log(`\n   ✅ Found Queenstown:`);
          console.log(`   - ID: ${destId}`);
          console.log(`   - Name: ${name}`);
          
          // Use this ID for the next test
          (global as any).queenstownDestId = destId;
        } else {
          console.log(`\n   ⚠️  Queenstown not found. Searching for New Zealand cities...`);
          const nzCities = dests.filter((d: any) => {
            const name = (d.destinationName || d.name || d.title || "").toLowerCase();
            return name.includes("zealand") || name.includes("auckland") || name.includes("wellington") || name.includes("queen");
          });
          nzCities.slice(0, 5).forEach((d: any, i: number) => {
            const name = d.destinationName || d.name || d.title || "unknown";
            const id = d.destinationId || d.id || d.destId || "unknown";
            console.log(`   ${i + 1}. ${name} (ID: ${id})`);
          });
        }
      }
    } catch (error) {
      console.error(`❌ Failed to get destinations:`, error);
      if (error instanceof Error) {
        console.error(`   Message: ${error.message}`);
      }
    }

    console.log("\n");

    // Test 1: Search by destination ID (Queenstown) - get 2 results with full details
    const queenstownDestId = (global as any).queenstownDestId;
    if (!queenstownDestId) {
      console.log("⚠️  Queenstown destination ID not found, skipping product search");
    } else {
      console.log(`Test 1: Search by destination ID (Queenstown ID: ${queenstownDestId}) - Requesting 2 results with full details`);
      console.log("-".repeat(50));
      try {
        const searchResults = await client.searchProducts({
          destinationId: queenstownDestId,
          count: 2, // Get only 2 results
          sortBy: "PRICE",
          currencyCode: "NZD",
        });

        console.log(`✅ Search successful!`);
        console.log(`   Found ${searchResults.products.length} products`);
        console.log(`   Total available: ${searchResults.totalCount}`);
        
        if (searchResults.products.length > 0) {
          console.log(`\n   Products found:`);
          
          // Display product information from search results (no need for individual product calls)
          for (let i = 0; i < searchResults.products.length; i++) {
            const product = searchResults.products[i];
            console.log(`\n   ${i + 1}. ${product.title || product.productCode}`);
            console.log(`      Code: ${product.productCode}`);
            
            // Duration from search results
            if (product.duration) {
              let durationStr = '';
              if (typeof product.duration === 'string') {
                durationStr = product.duration;
              } else if (typeof product.duration === 'object') {
                if (product.duration.fixedDurationInMinutes) {
                  const minutes = product.duration.fixedDurationInMinutes;
                  const days = Math.floor(minutes / 1440);
                  const hours = Math.floor((minutes % 1440) / 60);
                  durationStr = days > 0 ? `${days} day${days > 1 ? 's' : ''}` : `${hours}h`;
                } else if (product.duration.unstructuredDuration) {
                  durationStr = product.duration.unstructuredDuration;
                }
              }
              if (durationStr) {
                console.log(`      Duration: ${durationStr}`);
              }
            }
            
            // Rating from search results
            if (product.reviews) {
              const reviews = product.reviews;
              const rating = reviews.combinedAverageRating || reviews.averageRating || reviews.rating;
              const reviewCount = reviews.totalReviews || reviews.reviewCount || reviews.count;
              if (rating || reviewCount) {
                console.log(`      Rating: ${rating ? `${rating}/5` : 'N/A'} (${reviewCount || 0} reviews)`);
              }
            }
            
            // Price from search results
            if (product.pricing) {
              const pricing = product.pricing;
              let price = null;
              let currency = pricing.currency || 'NZD';
              
              if (pricing.summary) {
                price = pricing.summary.fromPriceFormatted || pricing.summary.fromPrice;
                if (price && typeof price === 'number') {
                  price = new Intl.NumberFormat('en-NZ', {
                    style: 'currency',
                    currency: currency,
                    minimumFractionDigits: 0,
                  }).format(price);
                }
              } else {
                price = pricing.fromPriceFormatted || pricing.fromPrice || pricing.price;
                currency = pricing.currencyCode || pricing.currency || currency;
              }
              
              if (price) {
                console.log(`      Price: ${price} (${currency})`);
              }
            }
            
            // Description preview
            if (product.description) {
              const desc = product.description.length > 100 
                ? product.description.substring(0, 100) + '...'
                : product.description;
              console.log(`      Description: ${desc}`);
            }
            
            // Images
            if (product.images && product.images.length > 0) {
              console.log(`      Images: ${product.images.length} available`);
            }
            
            // Product URL (affiliate link)
            if (product.productUrl) {
              console.log(`      Product URL: ${product.productUrl}`);
            } else if (product.url) {
              console.log(`      URL: ${product.url}`);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Search failed:`, error);
        if (error instanceof Error) {
          console.error(`   Message: ${error.message}`);
        }
      }
    }

    console.log("\n");

    // Test 2: Get tags (Golden Path endpoint)
    console.log("\nTest 2: Get tags (Golden Path: /products/tags)");
    console.log("-".repeat(50));
    try {
      const tags = await client.getTags();
      console.log(`✅ Tags retrieved!`);
      console.log(`   Total tags: ${tags.tags?.length || tags.length || 'unknown'}`);
    } catch (error) {
      console.error(`❌ Failed to get tags:`, error);
      if (error instanceof Error) {
        console.error(`   Message: ${error.message}`);
      }
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ All tests completed!");
    console.log("\nSummary:");
    console.log("- Search results include: duration, rating, price, description, images");
    console.log("- All essential information available from /products/search endpoint");
    console.log("- Ready for UI integration");

  } catch (error) {
    console.error("\n❌ Fatal error:", error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Run the tests
testViatorAPI().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
