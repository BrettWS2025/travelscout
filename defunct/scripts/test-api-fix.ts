/**
 * Test the API fix - should return 20 events when rows=20
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

async function testAPIFix() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  
  console.log("Testing API fix - should return 20 events with rows=20\n");
  
  // Test 1: Without date filter, rows=20
  console.log("Test 1: Auckland, no date filter, rows=20");
  const url1 = `${baseUrl}/api/events?lat=${AUCKLAND_LAT}&lng=${AUCKLAND_LNG}&radius=30&rows=20`;
  console.log(`URL: ${url1}\n`);
  
  const response1 = await fetch(url1);
  if (response1.ok) {
    const data1 = await response1.json();
    console.log(`✓ Returned: ${data1.count || 0} events`);
    console.log(`  Total available: ${data1.total || 'N/A'}`);
    console.log(`  Requested rows: ${data1.rows || 'N/A'}`);
    console.log("");
  } else {
    console.log(`✗ ERROR: ${response1.status}`);
  }
  
  // Test 2: With date filter, rows=20
  console.log("Test 2: Auckland, with date filter (2025-02-18), rows=20");
  const url2 = `${baseUrl}/api/events?lat=${AUCKLAND_LAT}&lng=${AUCKLAND_LNG}&radius=30&rows=20&start_date=2025-02-18&end_date=2025-02-18`;
  console.log(`URL: ${url2}\n`);
  
  const response2 = await fetch(url2);
  if (response2.ok) {
    const data2 = await response2.json();
    console.log(`✓ Returned: ${data2.count || 0} events`);
    console.log(`  Total available: ${data2.total || 'N/A'}`);
    console.log(`  Requested rows: ${data2.rows || 'N/A'}`);
  } else {
    console.log(`✗ ERROR: ${response2.status}`);
  }
}

testAPIFix().catch(console.error);
