/**
 * Test Eventfinda API for Auckland on February 19th
 * This script fetches events and analyzes categories for filtering purposes
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

// Auckland coordinates
const AUCKLAND_LAT = "-36.850886";
const AUCKLAND_LNG = "174.764509";
const TARGET_DATE = "2026-02-19"; // February 19th, 2026
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

async function testAucklandEvents() {
  console.log("=== Testing Eventfinda API for Auckland on February 19th ===\n");
  
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

  console.log(`Location: Auckland (${AUCKLAND_LAT}, ${AUCKLAND_LNG})`);
  console.log(`Date: ${TARGET_DATE}`);
  console.log(`Start Date: ${TARGET_DATE}`);
  console.log(`End Date: 2026-02-20 (next day, exclusive)`);
  console.log(`Radius: 30 km`);
  console.log("");

  // Fetch all pages
  while (hasMore) {
    const url = new URL("https://api.eventfinda.co.nz/v2/events.json");
    url.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
    url.searchParams.append("radius", "30");
    url.searchParams.append("rows", MAX_ROWS_PER_REQUEST.toString());
    url.searchParams.append("offset", offset.toString());
    url.searchParams.append("order", "date");
    url.searchParams.append("start_date", TARGET_DATE);
    // end_date is exclusive, so use the day after to include events on the target date
    url.searchParams.append("end_date", "2026-02-20");
    
    // Try without fields parameter first to see what's available by default
    // url.searchParams.append("fields", "event:(id,name,url,url_slug,description,datetime_start,datetime_end,datetime_summary,images,location:(id,name,url_slug,address,latitude,longitude),category:(id,name,url_slug),sessions:(id,datetime_start,datetime_end,datetime_summary,is_cancelled))");

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

  if (allEvents.length === 0) {
    console.log("No events found for this date and location.");
    return;
  }

  // First, let's inspect what fields are actually available
  console.log("=== Available Fields Inspection ===");
  console.log("");
  
  if (allEvents.length > 0) {
    const sampleEvent = allEvents[0];
    console.log(`Sample Event: ${sampleEvent.name}`);
    console.log(`All available fields:`);
    Object.keys(sampleEvent).sort().forEach(key => {
      const value = sampleEvent[key];
      const type = Array.isArray(value) 
        ? `array[${value.length > 0 ? typeof value[0] : 'unknown'}]`
        : typeof value;
      console.log(`  - ${key}: ${type}`);
      
      // Show nested structure for objects
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nestedKeys = Object.keys(value);
        if (nestedKeys.length > 0 && nestedKeys.length < 20) {
          nestedKeys.forEach(nestedKey => {
            console.log(`    └─ ${nestedKey}: ${typeof value[nestedKey]}`);
          });
        }
      }
    });
    console.log("");
    console.log("=== Full Sample Event (First Event) ===");
    console.log(JSON.stringify(sampleEvent, null, 2));
    console.log("");
  }
  
  // Check for category in a few events
  console.log("=== Category Field Check ===");
  console.log("");
  
  const sampleEvents = allEvents.slice(0, 5);
  sampleEvents.forEach((event, index) => {
    console.log(`Event ${index + 1}: ${event.name}`);
    console.log(`  Category field exists: ${!!event.category}`);
    console.log(`  Category type: ${typeof event.category}`);
    if (event.category) {
      console.log(`  Category value:`, JSON.stringify(event.category, null, 2));
    }
    console.log("");
  });

  // First, fetch category hierarchy to map parent IDs to names
  console.log("=== Fetching Category Hierarchy ===");
  console.log("");
  
  const catAuth = Buffer.from(`${username}:${password}`).toString("base64");
  
  let categoryIdMap = new Map<number, { id: number; name: string; parent_id: number | null }>();
  
  try {
    const catUrl = new URL("https://api.eventfinda.co.nz/v2/categories.json");
    const catResponse = await fetch(catUrl.toString(), {
      headers: {
        Authorization: `Basic ${catAuth}`,
        Accept: "application/json",
      },
    });
    
    if (catResponse.ok) {
      const catData = await catResponse.json();
      
      // Build category map - handle different response formats
      function processCategory(cat: any) {
        if (cat.id) {
          categoryIdMap.set(cat.id, {
            id: cat.id,
            name: cat.name,
            parent_id: cat.parent_id || null
          });
        }
        
        if (cat.categories && Array.isArray(cat.categories)) {
          cat.categories.forEach(processCategory);
        }
        if (cat.category && Array.isArray(cat.category)) {
          cat.category.forEach(processCategory);
        }
      }
      
      const categories = catData.categories || catData.category || [];
      if (Array.isArray(categories)) {
        categories.forEach(processCategory);
      } else {
        processCategory(categories);
      }
      
      console.log(`Loaded ${categoryIdMap.size} categories from API\n`);
    }
  } catch (error) {
    console.warn("Could not fetch categories from API, using parent_id mapping only");
  }
  
  // Known parent category mapping
  const parentCategoryNames: Record<number, string> = {
    6: "Concerts & Gig Guide",
    1: "Performing Arts",
    7: "Sports & Outdoors",
    190: "Festivals & Lifestyle",
    11: "Exhibitions",
    3: "Workshops, Conferences & Classes"
  };
  
  // Function to find top-level parent category
  function getParentCategory(categoryId: number | null): { id: number; name: string } | null {
    if (!categoryId) {
      return null;
    }
    
    // Check if this is already a top-level category
    if (parentCategoryNames[categoryId]) {
      return { id: categoryId, name: parentCategoryNames[categoryId] };
    }
    
    // Get category info from map or event data
    let cat = categoryIdMap.get(categoryId);
    if (!cat) {
      return null;
    }
    
    // If it has a parent, recurse
    if (cat.parent_id) {
      const parent = getParentCategory(cat.parent_id);
      if (parent) {
        return parent;
      }
    }
    
    // If we have a name from the map, use it
    if (cat.name) {
      return { id: cat.id, name: cat.name };
    }
    
    return null;
  }
  
  // Analyze categories by parent category
  console.log("=== Parent Category Analysis ===");
  console.log("");
  
  const parentCategoryMap = new Map<number, { name: string; count: number; events: any[] }>();
  const categoryMap = new Map<string, { count: number; events: any[] }>();
  
  allEvents.forEach(event => {
    if (event.category) {
      // Category is a single object (not an array) in the default response
      const cat = event.category;
      const catId = cat.id?.toString() || 'unknown';
      const catName = cat.name || 'Unknown Category';
      const key = `${catId}:${catName}`;
      
      // Track by child category
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { count: 0, events: [] });
      }
      
      const entry = categoryMap.get(key)!;
      entry.count++;
      entry.events.push({
        id: event.id,
        name: event.name,
        url: event.url,
        category: {
          id: cat.id,
          name: cat.name,
          url_slug: cat.url_slug,
          parent_id: cat.parent_id
        }
      });
      
      // Track by parent category - use parent_id directly if available, otherwise traverse
      let parentCat: { id: number; name: string } | null = null;
      
      if (cat.parent_id) {
        // Check if parent_id is a known top-level category
        if (parentCategoryNames[cat.parent_id]) {
          parentCat = { id: cat.parent_id, name: parentCategoryNames[cat.parent_id] };
        } else {
          // Try to get parent name from category map or traverse up
          parentCat = getParentCategory(cat.parent_id);
        }
      } else {
        // No parent_id, check if this category itself is a top-level one
        parentCat = getParentCategory(cat.id);
      }
      
      if (parentCat) {
        if (!parentCategoryMap.has(parentCat.id)) {
          parentCategoryMap.set(parentCat.id, { name: parentCat.name, count: 0, events: [] });
        }
        parentCategoryMap.get(parentCat.id)!.count++;
        parentCategoryMap.get(parentCat.id)!.events.push({
          id: event.id,
          name: event.name,
          url: event.url,
          childCategory: cat.name,
          childCategoryId: cat.id
        });
      }
    } else {
      // Event with no category
      const key = 'no-category:No Category';
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { count: 0, events: [] });
      }
      categoryMap.get(key)!.count++;
      categoryMap.get(key)!.events.push({
        id: event.id,
        name: event.name,
        url: event.url
      });
    }
  });
  
  // Show parent category breakdown
  console.log("=== Events by Parent Category ===");
  console.log("");
  
  const sortedParentCategories = Array.from(parentCategoryMap.entries())
    .sort((a, b) => b[1].count - a[1].count);
  
  sortedParentCategories.forEach(([parentId, data]) => {
    const percentage = ((data.count / allEvents.length) * 100).toFixed(1);
    console.log(`${data.name} (ID: ${parentId}): ${data.count} events (${percentage}%)`);
  });
  
  console.log("");
  console.log("=== Detailed Parent Category Breakdown ===");
  console.log("");
  
  sortedParentCategories.forEach(([parentId, data]) => {
    console.log(`\n${data.name} (ID: ${parentId}) - ${data.count} events:`);
    data.events.slice(0, 10).forEach((event: any) => {
      console.log(`  - ${event.name}`);
      if (event.childCategory) {
        console.log(`    (Child Category: ${event.childCategory})`);
      }
    });
    if (data.events.length > 10) {
      console.log(`  ... and ${data.events.length - 10} more`);
    }
  });
  
  console.log("");
  console.log("=== Child Category Analysis (Original) ===");
  console.log("");

  // Sort categories by count (descending)
  const sortedCategories = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].count - a[1].count);

  console.log(`Found ${categoryMap.size} unique categories:\n`);
  
  sortedCategories.forEach(([key, data], index) => {
    const [catId, catName] = key.split(':');
    console.log(`${index + 1}. ${catName} (ID: ${catId})`);
    if (data.events[0]?.category?.parent_id) {
      console.log(`   Parent Category ID: ${data.events[0].category.parent_id}`);
    }
    if (data.events[0]?.category?.url_slug) {
      console.log(`   URL Slug: ${data.events[0].category.url_slug}`);
    }
    console.log(`   Count: ${data.count} events`);
    console.log(`   Sample events:`);
    data.events.slice(0, 3).forEach((event: any) => {
      console.log(`     - ${event.name} (ID: ${event.id})`);
    });
    if (data.events.length > 3) {
      console.log(`     ... and ${data.events.length - 3} more`);
    }
    console.log("");
  });

  // Show category breakdown summary
  console.log("=== Category Breakdown Summary ===");
  console.log("");
  sortedCategories.forEach(([key, data]) => {
    const [catId, catName] = key.split(':');
    const percentage = ((data.count / allEvents.length) * 100).toFixed(1);
    console.log(`${catName.padEnd(40)} ${data.count.toString().padStart(4)} events (${percentage}%)`);
  });

  console.log("");
  console.log("=== Sample Events by Category ===");
  console.log("");
  
  // Show a few sample events from top categories
  const topCategories = sortedCategories.slice(0, 5);
  topCategories.forEach(([key, data]) => {
    const [catId, catName] = key.split(':');
    console.log(`\n${catName} (${data.count} events):`);
    data.events.slice(0, 5).forEach((event: any) => {
      console.log(`  - ${event.name}`);
      console.log(`    URL: ${event.url}`);
    });
  });

  // Show events with no category
  const noCategory = categoryMap.get('no-category:No Category');
  if (noCategory && noCategory.count > 0) {
    console.log(`\n\nEvents with No Category (${noCategory.count} events):`);
    noCategory.events.slice(0, 5).forEach((event: any) => {
      console.log(`  - ${event.name}`);
      console.log(`    URL: ${event.url}`);
    });
  }

  // List ALL events with their categories
  console.log("\n\n=== ALL EVENTS WITH CATEGORIES ===");
  console.log("");
  
  allEvents.forEach((event, index) => {
    console.log(`${index + 1}. ${event.name}`);
    console.log(`   Event ID: ${event.id}`);
    console.log(`   URL: ${event.url}`);
    if (event.category) {
      const parentCat = getParentCategory(event.category.id);
      console.log(`   Child Category: ${event.category.name} (ID: ${event.category.id})`);
      console.log(`   Category URL Slug: ${event.category.url_slug}`);
      if (parentCat) {
        console.log(`   Parent Category: ${parentCat.name} (ID: ${parentCat.id})`);
      } else if (event.category.parent_id) {
        console.log(`   Parent Category ID: ${event.category.parent_id} (name unknown)`);
      }
    } else {
      console.log(`   Category: No Category`);
    }
    if (event.datetime_start) {
      console.log(`   Start: ${event.datetime_start}`);
    }
    if (event.datetime_summary) {
      console.log(`   Summary: ${event.datetime_summary}`);
    }
    console.log("");
  });
}

testAucklandEvents().catch(console.error);
