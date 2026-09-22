/**
 * Test script for Events API - Auckland on February 18th
 * 
 * Usage:
 *   npm run test:events:feb18
 * 
 * Or with tsx:
 *   tsx scripts/test-events-api-feb18.ts
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

// Auckland coordinates
const AUCKLAND_LAT = "-36.84846";
const AUCKLAND_LNG = "174.763332";
const TEST_DATE = "2025-02-18"; // February 18th, 2025

async function testEventsAPI() {
  console.log("Testing Events API for Auckland on February 18th...");
  console.log(`Location: Auckland (${AUCKLAND_LAT}, ${AUCKLAND_LNG})`);
  console.log(`Date: ${TEST_DATE}`);
  console.log("");

  try {
    // Test the API route
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
    // Note: Eventfinda API has a max of 20 rows per request
    const apiUrl = `${baseUrl}/api/events?lat=${AUCKLAND_LAT}&lng=${AUCKLAND_LNG}&radius=30&rows=20&start_date=${TEST_DATE}&end_date=${TEST_DATE}`;

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

    if (data.error) {
      console.error("ERROR: API request failed");
      console.error("Response:", JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log("✓ API request successful!");
    console.log("");
    console.log(`Total events found: ${data.total || 0}`);
    console.log(`Events returned in response: ${data.count || 0}`);
    console.log(`Events array length: ${data.events?.length || 0}`);
    console.log("");

    if (data.events && data.events.length > 0) {
      console.log(`\n✓ Found ${data.events.length} event(s) for Auckland on ${TEST_DATE}`);
      
      // Check how many events actually start on the target date
      const targetDateStr = TEST_DATE;
      const eventsOnTargetDate = data.events.filter((event: any) => {
        if (!event.datetime_start) return false;
        const eventDate = event.datetime_start.split(' ')[0]; // Get date part (YYYY-MM-DD)
        return eventDate === targetDateStr;
      });
      
      console.log(`Events actually starting on ${TEST_DATE}: ${eventsOnTargetDate.length}`);
      console.log(`Events with other start dates: ${data.events.length - eventsOnTargetDate.length}`);
      
      console.log("\nAll events returned:");
      console.log("=".repeat(80));
      
      data.events.forEach((event: any, index: number) => {
        const eventDate = event.datetime_start ? event.datetime_start.split(' ')[0] : 'N/A';
        const isOnTargetDate = eventDate === targetDateStr;
        const marker = isOnTargetDate ? '✓' : '✗';
        
        console.log(`\n${marker} ${index + 1}. ${event.name}`);
        console.log(`   ID: ${event.id}`);
        console.log(`   Start: ${event.datetime_start}`);
        console.log(`   Date: ${eventDate} ${isOnTargetDate ? '(MATCHES)' : '(DOES NOT MATCH)'}`);
        if (event.location) {
          console.log(`   Location: ${event.location.name}`);
        }
      });

      console.log("");
      console.log("=".repeat(80));
    } else {
      console.log(`⚠ No events found for Auckland on ${TEST_DATE}`);
    }

    console.log("");
    console.log("✓ Test completed successfully!");

    // Return the count for programmatic use
    return data.events?.length || 0;

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
testEventsAPI().then((count) => {
  console.log(`\nFinal count: ${count} events`);
  process.exit(0);
}).catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
