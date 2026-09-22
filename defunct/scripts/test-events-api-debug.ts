/**
 * Debug script for Events API - Test query parameters and response
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

const AUCKLAND_LAT = "-36.84846";
const AUCKLAND_LNG = "174.763332";
const TEST_DATE = "2025-02-18";

async function testDirectEventfindaAPI() {
  console.log("=== Testing Direct Eventfinda API Call ===\n");
  
  const username = process.env.EVENTFINDA_USERNAME;
  const password = process.env.EVENTFINDA_PASSWORD;

  if (!username || !password) {
    console.error("ERROR: EVENTFINDA_USERNAME and EVENTFINDA_PASSWORD must be set");
    return;
  }

  // Test 1: Without date filters, with rows=100
  console.log("Test 1: Auckland, no date filter, rows=100");
  const url1 = new URL("https://api.eventfinda.co.nz/v2/events.json");
  url1.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
  url1.searchParams.append("radius", "30");
  url1.searchParams.append("rows", "100");
  url1.searchParams.append("offset", "0");
  url1.searchParams.append("order", "date");
  url1.searchParams.append("fields", "event:(id,name,url,url_slug,description,datetime_start,datetime_end,images,location:(id,name,url_slug,address,latitude,longitude),category:(id,name,url_slug))");

  console.log(`URL: ${url1.toString()}`);
  
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const response1 = await fetch(url1.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!response1.ok) {
    const errorText = await response1.text();
    console.error(`ERROR: Status ${response1.status}`);
    console.error("Response:", errorText);
    return;
  }

  const data1 = await response1.json();
  console.log(`Response: ${data1.events?.length || 0} events`);
  console.log(`Meta total: ${data1.meta?.total || 'N/A'}`);
  console.log(`Meta rows: ${data1.meta?.rows || 'N/A'}`);
  console.log(`Meta offset: ${data1.meta?.offset || 'N/A'}`);
  console.log(`Full response keys: ${Object.keys(data1).join(', ')}`);
  if (data1['@attributes']) {
    console.log(`@attributes:`, JSON.stringify(data1['@attributes'], null, 2));
  }
  if (data1.error) {
    console.log(`ERROR in response:`, data1.error);
  }
  console.log("");

  // Test 2: With date filters, rows=100
  console.log("Test 2: Auckland, with date filter (2025-02-18), rows=100");
  const url2 = new URL("https://api.eventfinda.co.nz/v2/events.json");
  url2.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
  url2.searchParams.append("radius", "30");
  url2.searchParams.append("rows", "100");
  url2.searchParams.append("offset", "0");
  url2.searchParams.append("order", "date");
  url2.searchParams.append("start_date", TEST_DATE);
  url2.searchParams.append("end_date", TEST_DATE);
  url2.searchParams.append("fields", "event:(id,name,url,url_slug,description,datetime_start,datetime_end,images,location:(id,name,url_slug,address,latitude,longitude),category:(id,name,url_slug))");

  console.log(`URL: ${url2.toString()}`);
  
  const response2 = await fetch(url2.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!response2.ok) {
    const errorText = await response2.text();
    console.error(`ERROR: Status ${response2.status}`);
    console.error("Response:", errorText);
    return;
  }

  const data2 = await response2.json();
  console.log(`Response: ${data2.events?.length || 0} events`);
  console.log(`Meta total: ${data2.meta?.total || 'N/A'}`);
  console.log(`Meta rows: ${data2.meta?.rows || 'N/A'}`);
  console.log(`Meta offset: ${data2.meta?.offset || 'N/A'}`);
  
  if (data2.events && data2.events.length > 0) {
    console.log("\nFirst 3 events:");
    data2.events.slice(0, 3).forEach((event: any, i: number) => {
      console.log(`  ${i + 1}. ${event.name} - ${event.datetime_start}`);
    });
  }
  console.log("");

  // Test 3: Check if date format is the issue - try different formats
  console.log("Test 3: Testing different date formats");
  const dateFormats = [
    "2025-02-18",
    "20250218",
    "18/02/2025",
  ];

  for (const dateFormat of dateFormats) {
    const url3 = new URL("https://api.eventfinda.co.nz/v2/events.json");
    url3.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
    url3.searchParams.append("radius", "30");
    url3.searchParams.append("rows", "100");
    url3.searchParams.append("start_date", dateFormat);
    url3.searchParams.append("end_date", dateFormat);

    const response3 = await fetch(url3.toString(), {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (response3.ok) {
      const data3 = await response3.json();
      console.log(`  Format "${dateFormat}": ${data3.events?.length || 0} events (total: ${data3.meta?.total || 'N/A'})`);
    } else {
      console.log(`  Format "${dateFormat}": ERROR ${response3.status}`);
    }
  }
  console.log("");

  // Test 4: Test without rows parameter (should use default)
  console.log("Test 4: Without rows parameter (should use default)");
  const url4 = new URL("https://api.eventfinda.co.nz/v2/events.json");
  url4.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
  url4.searchParams.append("radius", "30");
  url4.searchParams.append("offset", "0");
  url4.searchParams.append("order", "date");

  const response4 = await fetch(url4.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (response4.ok) {
    const data4 = await response4.json();
    console.log(`Response: ${data4.events?.length || 0} events`);
    console.log(`Meta total: ${data4.meta?.total || 'N/A'}`);
    console.log(`Meta rows: ${data4.meta?.rows || 'N/A'}`);
  }

  // Test 5: Test without fields parameter (simpler query)
  console.log("\nTest 5: Without fields parameter (simpler query), rows=100");
  const url5 = new URL("https://api.eventfinda.co.nz/v2/events.json");
  url5.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
  url5.searchParams.append("radius", "30");
  url5.searchParams.append("rows", "100");
  url5.searchParams.append("offset", "0");
  url5.searchParams.append("order", "date");

  console.log(`URL: ${url5.toString()}`);
  
  const response5 = await fetch(url5.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (response5.ok) {
    const data5 = await response5.json();
    console.log(`Response: ${data5.events?.length || 0} events`);
    console.log(`Meta total: ${data5.meta?.total || 'N/A'}`);
    console.log(`Meta rows: ${data5.meta?.rows || 'N/A'}`);
    console.log(`Meta offset: ${data5.meta?.offset || 'N/A'}`);
    console.log(`Full response keys: ${Object.keys(data5).join(', ')}`);
    if (data5['@attributes']) {
      console.log(`@attributes:`, JSON.stringify(data5['@attributes'], null, 2));
    }
  } else {
    const errorText = await response5.text();
    console.error(`ERROR: Status ${response5.status}`);
    console.error("Response:", errorText);
  }
}

testDirectEventfindaAPI().catch(console.error);
