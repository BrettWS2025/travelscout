/**
 * Test if Eventfinda API uses 'row' (singular) instead of 'rows' (plural)
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

async function testRowVsRows() {
  const username = process.env.EVENTFINDA_USERNAME;
  const password = process.env.EVENTFINDA_PASSWORD;

  if (!username || !password) {
    console.error("ERROR: Credentials not set");
    return;
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  console.log("Testing 'row' (singular) vs 'rows' (plural) parameter:\n");

  // Test with 'rows' (plural) - what we're currently using
  console.log("=== Test 1: Using 'rows' parameter ===\n");
  const url1 = new URL("https://api.eventfinda.co.nz/v2/events.json");
  url1.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
  url1.searchParams.append("radius", "30");
  url1.searchParams.append("rows", "100");  // plural
  url1.searchParams.append("offset", "0");
  url1.searchParams.append("order", "date");

  console.log(`URL: ${url1.toString()}\n`);

  const response1 = await fetch(url1.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (response1.ok) {
    const data1 = await response1.json();
    console.log(`Using 'rows=100': ${data1.events?.length || 0} events returned`);
    console.log(`Total available: ${data1['@attributes']?.count || 'N/A'}`);
    console.log(`Response keys: ${Object.keys(data1).join(', ')}`);
    if (data1.error) console.log(`Error: ${JSON.stringify(data1.error)}`);
    if (data1.warning) console.log(`Warning: ${JSON.stringify(data1.warning)}`);
    console.log("");
  } else {
    const errorText = await response1.text();
    console.log(`Using 'rows=100': ERROR ${response1.status}`);
    console.log(`Response: ${errorText}\n`);
  }

  // Test with 'row' (singular) - what the API might expect
  console.log("=== Test 2: Using 'row' parameter (singular) ===\n");
  const url2 = new URL("https://api.eventfinda.co.nz/v2/events.json");
  url2.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
  url2.searchParams.append("radius", "30");
  url2.searchParams.append("row", "100");  // singular
  url2.searchParams.append("offset", "0");
  url2.searchParams.append("order", "date");

  console.log(`URL: ${url2.toString()}\n`);

  const response2 = await fetch(url2.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (response2.ok) {
    const data2 = await response2.json();
    console.log(`Using 'row=100': ${data2.events?.length || 0} events returned`);
    console.log(`Total available: ${data2['@attributes']?.count || 'N/A'}\n`);
  } else {
    console.log(`Using 'row=100': ERROR ${response2.status}\n`);
  }

  // Test with both parameters
  console.log("=== Test 3: Using both 'row' and 'rows' parameters ===\n");
  const url3 = new URL("https://api.eventfinda.co.nz/v2/events.json");
  url3.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
  url3.searchParams.append("radius", "30");
  url3.searchParams.append("row", "100");  // singular first
  url3.searchParams.append("rows", "100");  // plural second
  url3.searchParams.append("offset", "0");
  url3.searchParams.append("order", "date");

  console.log(`URL: ${url3.toString()}\n`);

  const response3 = await fetch(url3.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (response3.ok) {
    const data3 = await response3.json();
    console.log(`Using both: ${data3.events?.length || 0} events returned`);
    console.log(`Total available: ${data3['@attributes']?.count || 'N/A'}\n`);
  } else {
    console.log(`Using both: ERROR ${response3.status}\n`);
  }
}

testRowVsRows().catch(console.error);
