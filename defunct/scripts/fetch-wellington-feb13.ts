/**
 * Fetch all Eventfinda API data for Wellington on February 13th
 * This script fetches the complete dataset to help understand available fields
 */

import { readFileSync, writeFileSync } from "fs";
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
          const value = valueParts.join("=").replace(/^["']|["']$/g, "");
          process.env[key.trim()] = value.trim();
        }
      }
    }
  } catch (error) {
    console.warn("Warning: Could not load .env.local file.");
  }
}

loadEnv();

// Wellington coordinates
const WELLINGTON_LAT = "-41.2924";
const WELLINGTON_LNG = "174.7787";
const TARGET_DATE = "2025-02-13"; // February 13th, 2025
const MAX_ROWS_PER_REQUEST = 20; // Eventfinda API limit

interface EventfindaResponse {
  events: any[];
  meta?: {
    total: number;
    offset: number;
    rows: number;
  };
  "@attributes"?: {
    count: number;
  };
  [key: string]: any;
}

async function fetchAllEvents() {
  console.log("=== Fetching All Eventfinda Data for Wellington on February 13th ===\n");
  
  const username = process.env.EVENTFINDA_USERNAME;
  const password = process.env.EVENTFINDA_PASSWORD;

  if (!username || !password) {
    console.error("ERROR: EVENTFINDA_USERNAME and EVENTFINDA_PASSWORD must be set in .env.local");
    process.exit(1);
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const allEvents: any[] = [];
  let offset = 0;
  let totalCount = 0;
  let hasMore = true;

  console.log(`Location: Wellington (${WELLINGTON_LAT}, ${WELLINGTON_LNG})`);
  console.log(`Date: ${TARGET_DATE}`);
  console.log(`Radius: 30 km`);
  console.log("");

  // Fetch all pages
  while (hasMore) {
    const url = new URL("https://api.eventfinda.co.nz/v2/events.json");
    url.searchParams.append("point", `${WELLINGTON_LAT},${WELLINGTON_LNG}`);
    url.searchParams.append("radius", "30");
    url.searchParams.append("rows", MAX_ROWS_PER_REQUEST.toString());
    url.searchParams.append("offset", offset.toString());
    url.searchParams.append("order", "date");
    url.searchParams.append("start_date", TARGET_DATE);
    // end_date is exclusive, so use the day after to include events on the target date
    url.searchParams.append("end_date", "2025-02-14");
    
    // Request all available fields to see what data is available
    // Not specifying fields parameter to get all default fields
    // url.searchParams.append("fields", "event:(id,name,url,url_slug,description,datetime_start,datetime_end,images,location:(id,name,url_slug,address,latitude,longitude),category:(id,name,url_slug))");

    console.log(`Fetching page ${Math.floor(offset / MAX_ROWS_PER_REQUEST) + 1} (offset: ${offset})...`);

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`ERROR: API returned status ${response.status}`);
        console.error("Response:", errorText);
        break;
      }

      const data: EventfindaResponse = await response.json();
      
      // Get total count from first request
      if (offset === 0) {
        totalCount = data["@attributes"]?.count || data.meta?.total || 0;
        console.log(`Total events found: ${totalCount}`);
        console.log("");
      }

      if (data.events && data.events.length > 0) {
        allEvents.push(...data.events);
        console.log(`  ✓ Fetched ${data.events.length} events (total so far: ${allEvents.length})`);
        
        // Check if there are more events
        if (data.events.length < MAX_ROWS_PER_REQUEST || allEvents.length >= totalCount) {
          hasMore = false;
        } else {
          offset += MAX_ROWS_PER_REQUEST;
        }
      } else {
        hasMore = false;
      }

      // Small delay to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error("Error fetching events:", error);
      break;
    }
  }

  console.log("");
  console.log(`=== Fetch Complete ===`);
  console.log(`Total events retrieved: ${allEvents.length}`);
  console.log("");

  // Save the complete raw response
  const outputData = {
    metadata: {
      location: "Wellington",
      coordinates: { lat: WELLINGTON_LAT, lng: WELLINGTON_LNG },
      date: TARGET_DATE,
      totalEvents: allEvents.length,
      fetchedAt: new Date().toISOString(),
    },
    events: allEvents,
  };

  const outputPath = join(process.cwd(), "data", "wellington-feb13-complete.json");
  writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");
  console.log(`✓ Saved complete data to: ${outputPath}`);
  console.log("");

  // Analyze and display available fields
  if (allEvents.length > 0) {
    console.log("=== Available Fields Analysis ===");
    console.log("");
    
    // Get all unique keys from all events
    const allKeys = new Set<string>();
    allEvents.forEach(event => {
      Object.keys(event).forEach(key => allKeys.add(key));
    });

    console.log(`Top-level event fields (${allKeys.size} total):`);
    Array.from(allKeys).sort().forEach(key => {
      const sampleValue = allEvents[0][key];
      const type = Array.isArray(sampleValue) 
        ? `array[${sampleValue.length > 0 ? typeof sampleValue[0] : 'unknown'}]`
        : typeof sampleValue;
      console.log(`  - ${key}: ${type}`);
      
      // Show nested structure for objects
      if (typeof sampleValue === 'object' && sampleValue !== null && !Array.isArray(sampleValue)) {
        const nestedKeys = Object.keys(sampleValue);
        if (nestedKeys.length > 0) {
          nestedKeys.forEach(nestedKey => {
            console.log(`    └─ ${nestedKey}: ${typeof sampleValue[nestedKey]}`);
          });
        }
      }
    });

    console.log("");
    console.log("=== Sample Event (First Event) ===");
    console.log(JSON.stringify(allEvents[0], null, 2));
  } else {
    console.log("No events found for this date and location.");
  }
}

fetchAllEvents().catch(console.error);
