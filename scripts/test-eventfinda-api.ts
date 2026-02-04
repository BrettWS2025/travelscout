/**
 * Test script for Eventfinda Events API
 * 
 * Usage:
 *   npm run test:eventfinda [lat] [lng]
 * 
 * Example:
 *   npm run test:eventfinda -36.84846 174.763332
 */

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
    console.warn("Warning: Could not load .env.local file. Make sure environment variables are set.");
  }
}

loadEnv();

const DEFAULT_LAT = "-36.84846"; // Auckland
const DEFAULT_LNG = "174.763332";

async function testEventfindaAPI() {
  const lat = process.argv[2] || DEFAULT_LAT;
  const lng = process.argv[3] || DEFAULT_LNG;

  console.log("Testing Eventfinda Events API...");
  console.log(`Location: ${lat}, ${lng}`);
  console.log(`Radius: 30 km`);
  console.log("");

  // Check if credentials are available
  if (!process.env.EVENTFINDA_USERNAME || !process.env.EVENTFINDA_PASSWORD) {
    console.error("ERROR: EVENTFINDA_USERNAME and EVENTFINDA_PASSWORD must be set in .env.local");
    console.error("Please ensure these environment variables are configured.");
    process.exit(1);
  }

  try {
    // Test the API route
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    const apiUrl = `${baseUrl}/api/events?lat=${lat}&lng=${lng}&radius=30&rows=10&order=date`;

    console.log(`Fetching: ${apiUrl}`);
    console.log("");

    const response = await fetch(apiUrl);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ERROR: API returned status ${response.status}`);
      console.error("Response:", errorText);
      process.exit(1);
    }

    const data = await response.json();

    if (!data.success) {
      console.error("ERROR: API request failed");
      console.error("Response:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log("✓ API request successful!");
    console.log("");
    console.log(`Total events found: ${data.total}`);
    console.log(`Events returned: ${data.count}`);
    console.log("");

    if (data.events && data.events.length > 0) {
      console.log("Sample events:");
      console.log("=" .repeat(80));
      
      data.events.slice(0, 5).forEach((event: any, index: number) => {
        console.log(`\n${index + 1}. ${event.name}`);
        console.log(`   ID: ${event.id}`);
        if (event.url) {
          console.log(`   URL: ${event.url}`);
        }
        // Handle different image structures
        // Images structure: { "@attributes": { count }, "images": [...] }
        // Each image has: id, is_primary, original_url, and optionally transforms
        let primaryImage: any = null;
        let imageUrl: string | null = null;
        
        if (event.images) {
          // Check if images is nested as images.images (most common structure)
          if (event.images.images && Array.isArray(event.images.images) && event.images.images.length > 0) {
            // Try to find primary image, or use first image
            primaryImage = event.images.images.find((img: any) => img.is_primary === true) || event.images.images[0];
          } 
          // Check if images is an array directly
          else if (Array.isArray(event.images) && event.images.length > 0) {
            primaryImage = event.images.find((img: any) => img.is_primary === true) || event.images[0];
          }
        }
        
        if (primaryImage) {
          // Eventfinda uses 'original_url' for the image URL, not 'url'
          // Check for transforms first (different sizes/transformations)
          if (primaryImage.transforms && Array.isArray(primaryImage.transforms) && primaryImage.transforms.length > 0) {
            // Use the first transform or find a specific transformation
            const transform = primaryImage.transforms.find((t: any) => t.transformation_id === 1) || primaryImage.transforms[0];
            imageUrl = transform.url || primaryImage.original_url || primaryImage.url || null;
            if (imageUrl) {
              console.log(`   Primary Image: ${imageUrl}`);
              if (transform.width && transform.height) {
                console.log(`   Image Size: ${transform.width}x${transform.height}`);
              }
            }
          } else {
            // Use original_url if available, otherwise fall back to url
            imageUrl = primaryImage.original_url || primaryImage.url || null;
            if (imageUrl) {
              console.log(`   Primary Image: ${imageUrl}`);
              if (primaryImage.width && primaryImage.height) {
                console.log(`   Image Size: ${primaryImage.width}x${primaryImage.height}`);
              }
            }
          }
        }
        
        if (!imageUrl) {
          console.log(`   Primary Image: (not available)`);
        }
        console.log(`   Start: ${event.datetime_start}`);
        if (event.location) {
          console.log(`   Location: ${event.location.name}`);
          if (event.location.address) {
            console.log(`   Address: ${event.location.address}`);
          }
        }
        if (event.category) {
          console.log(`   Category: ${event.category.name}`);
        }
        if (event.description) {
          const desc = event.description.substring(0, 100).replace(/\s+/g, " ");
          console.log(`   Description: ${desc}...`);
        }
      });

      console.log("");
      console.log("=" .repeat(80));
    } else {
      console.log("No events found for the given location and radius.");
    }

    console.log("");
    console.log("✓ Test completed successfully!");

  } catch (error) {
    console.error("ERROR: Failed to test API");
    console.error(error);
    
    if (error instanceof Error && error.message.includes("fetch")) {
      console.error("");
      console.error("Make sure the Next.js dev server is running:");
      console.error("  npm run dev");
    }
    
    process.exit(1);
  }
}

// Run the test
testEventfindaAPI();
