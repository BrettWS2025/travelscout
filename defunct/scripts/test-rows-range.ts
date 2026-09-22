/**
 * Test rows parameter with values between 20 and 50 to find the limit
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

async function testRowsRange() {
  const username = process.env.EVENTFINDA_USERNAME;
  const password = process.env.EVENTFINDA_PASSWORD;

  if (!username || !password) {
    console.error("ERROR: Credentials not set");
    return;
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  // Test values from 20 to 30 to find where it breaks
  const rowValues = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 35, 40, 45, 50];

  console.log("Testing rows parameter to find the limit:\n");
  console.log("rows | returned | status");
  console.log("-----|----------|--------");

  for (const rows of rowValues) {
    const url = new URL("https://api.eventfinda.co.nz/v2/events.json");
    url.searchParams.append("point", `${AUCKLAND_LAT},${AUCKLAND_LNG}`);
    url.searchParams.append("radius", "30");
    url.searchParams.append("rows", rows.toString());
    url.searchParams.append("offset", "0");
    url.searchParams.append("order", "date");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const returned = data.events?.length || 0;
      const status = returned === rows ? "✓" : returned === 10 ? "✗ (defaulted to 10)" : `✗ (got ${returned})`;
      console.log(`${rows.toString().padStart(4)} | ${returned.toString().padStart(8)} | ${status}`);
    } else {
      console.log(`${rows.toString().padStart(4)} | ERROR ${response.status}`);
    }
  }
}

testRowsRange().catch(console.error);
