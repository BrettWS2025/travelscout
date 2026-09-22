/**
 * Test script to check if rows parameter is working
 */

import { readFileSync } from "fs";
import { join } from "path";

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

async function testRowsParameter() {
  const username = process.env.EVENTFINDA_USERNAME;
  const password = process.env.EVENTFINDA_PASSWORD;

  if (!username || !password) {
    console.error("ERROR: Credentials not set");
    return;
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  // Test different row values
  const rowValues = [10, 20, 50, 100];

  for (const rows of rowValues) {
    console.log(`\n=== Testing with rows=${rows} ===`);
    
    // Test WITHOUT fields parameter
    const url1 = new URL("https://api.eventfinda.co.nz/v2/events.json");
    url1.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
    url1.searchParams.append("radius", "30");
    url1.searchParams.append("rows", rows.toString());
    url1.searchParams.append("offset", "0");
    url1.searchParams.append("order", "date");

    const response1 = await fetch(url1.toString(), {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (response1.ok) {
      const data1 = await response1.json();
      console.log(`  Without fields: ${data1.events?.length || 0} events returned`);
      console.log(`  Total available: ${data1['@attributes']?.count || 'N/A'}`);
    } else {
      console.log(`  Without fields: ERROR ${response1.status}`);
    }

    // Test WITH fields parameter
    const url2 = new URL("https://api.eventfinda.co.nz/v2/events.json");
    url2.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
    url2.searchParams.append("radius", "30");
    url2.searchParams.append("rows", rows.toString());
    url2.searchParams.append("offset", "0");
    url2.searchParams.append("order", "date");
    url2.searchParams.append("fields", "event:(id,name,url,url_slug,description,datetime_start,datetime_end,images,location:(id,name,url_slug,address,latitude,longitude),category:(id,name,url_slug))");

    const response2 = await fetch(url2.toString(), {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (response2.ok) {
      const data2 = await response2.json();
      console.log(`  With fields: ${data2.events?.length || 0} events returned`);
      console.log(`  Total available: ${data2['@attributes']?.count || 'N/A'}`);
    } else {
      console.log(`  With fields: ERROR ${response2.status}`);
    }
  }
}

testRowsParameter().catch(console.error);
