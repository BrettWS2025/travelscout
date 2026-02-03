/**
 * Fetch Eventfinda Categories to map parent IDs to names
 * This will help us identify the higher-level categories used for filtering
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

async function fetchCategories() {
  console.log("=== Fetching Eventfinda Categories ===\n");
  
  const username = process.env.EVENTFINDA_USERNAME;
  const password = process.env.EVENTFINDA_PASSWORD;

  if (!username || !password) {
    console.error("ERROR: EVENTFINDA_USERNAME and EVENTFINDA_PASSWORD must be set in .env.local");
    process.exit(1);
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  // Fetch categories - try without levels first to get all categories
  const url = new URL("https://api.eventfinda.co.nz/v2/categories.json");
  // Don't specify levels to get all categories

  console.log(`Fetching categories from: ${url.toString()}`);
  console.log("");

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
      process.exit(1);
    }

    const data = await response.json();
    
    // Build a map of category ID to category info
    const categoryMap = new Map<number, any>();
    
    // Process categories - they might be in different formats
    const categories = data.categories || data.category || [];
    
    function processCategory(cat: any) {
      if (cat.id) {
        categoryMap.set(cat.id, {
          id: cat.id,
          name: cat.name,
          url_slug: cat.url_slug,
          parent_id: cat.parent_id || null,
          children: []
        });
      }
      
      // Process children if they exist
      if (cat.categories && Array.isArray(cat.categories)) {
        cat.categories.forEach((child: any) => processCategory(child));
      }
      if (cat.category && Array.isArray(cat.category)) {
        cat.category.forEach((child: any) => processCategory(child));
      }
    }
    
    if (Array.isArray(categories)) {
      categories.forEach(processCategory);
    } else {
      processCategory(categories);
    }

    console.log(`Found ${categoryMap.size} categories\n`);
    
    // Find top-level categories (those with no parent or parent_id = null)
    const topLevelCategories = Array.from(categoryMap.values())
      .filter(cat => !cat.parent_id || cat.parent_id === null)
      .sort((a, b) => a.name.localeCompare(b.name));
    
    console.log("=== Top-Level Categories (Parent Categories) ===");
    console.log("");
    topLevelCategories.forEach(cat => {
      console.log(`${cat.id}: ${cat.name}`);
      console.log(`  URL Slug: ${cat.url_slug}`);
      console.log("");
    });
    
    // Build parent category map
    const parentCategoryMap = new Map<number, any>();
    categoryMap.forEach((cat, id) => {
      if (cat.parent_id) {
        const parent = categoryMap.get(cat.parent_id);
        if (parent) {
          if (!parentCategoryMap.has(cat.parent_id)) {
            parentCategoryMap.set(cat.parent_id, {
              id: parent.id,
              name: parent.name,
              url_slug: parent.url_slug,
              children: []
            });
          }
          parentCategoryMap.get(cat.parent_id)!.children.push(cat);
        }
      }
    });
    
    console.log("\n=== Parent Categories with Children ===");
    console.log("");
    Array.from(parentCategoryMap.entries())
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .forEach(([parentId, parent]) => {
        console.log(`${parent.name} (ID: ${parentId})`);
        console.log(`  URL Slug: ${parent.url_slug}`);
        console.log(`  Children (${parent.children.length}):`);
        parent.children.slice(0, 10).forEach((child: any) => {
          console.log(`    - ${child.name} (ID: ${child.id})`);
        });
        if (parent.children.length > 10) {
          console.log(`    ... and ${parent.children.length - 10} more`);
        }
        console.log("");
      });
    
    // Save full category map to file for reference
    const fs = require('fs');
    const outputPath = join(process.cwd(), "data", "categories-map.json");
    const outputData = {
      fetchedAt: new Date().toISOString(),
      totalCategories: categoryMap.size,
      categories: Array.from(categoryMap.values()),
      topLevelCategories: topLevelCategories,
      parentCategories: Array.from(parentCategoryMap.values())
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");
    console.log(`\n✓ Saved category map to: ${outputPath}`);
    
    return categoryMap;
    
  } catch (error) {
    console.error("Error fetching categories:", error);
    process.exit(1);
  }
}

fetchCategories().catch(console.error);
