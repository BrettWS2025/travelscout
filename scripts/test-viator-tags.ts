/**
 * Test script to fetch and inspect Viator tags endpoint structure
 * Run with: npx tsx scripts/test-viator-tags.ts
 */

import { createViatorClient } from "@/lib/viator";

async function testViatorTags() {
  console.log("=".repeat(60));
  console.log("Testing Viator Tags Endpoint");
  console.log("=".repeat(60));
  
  try {
    const client = createViatorClient();
    
    console.log("\n[1] Fetching tags from /products/tags endpoint...");
    const tagsResponse = await client.getTags();
    
    console.log("\n[2] Response structure:");
    console.log("Type:", typeof tagsResponse);
    console.log("Is Array:", Array.isArray(tagsResponse));
    
    if (Array.isArray(tagsResponse)) {
      console.log("Array length:", tagsResponse.length);
      if (tagsResponse.length > 0) {
        console.log("\n[3] First tag structure:");
        console.log(JSON.stringify(tagsResponse[0], null, 2));
        
        console.log("\n[4] Sample of first 5 tags:");
        tagsResponse.slice(0, 5).forEach((tag: any, index: number) => {
          console.log(`\nTag ${index + 1}:`);
          console.log(JSON.stringify(tag, null, 2));
        });
      }
    } else if (tagsResponse && typeof tagsResponse === 'object') {
      console.log("\n[3] Response object keys:", Object.keys(tagsResponse));
      
      // Check for common response structures
      if ('tags' in tagsResponse) {
        const tags = (tagsResponse as any).tags;
        console.log("Found 'tags' property, type:", typeof tags, "isArray:", Array.isArray(tags));
        if (Array.isArray(tags) && tags.length > 0) {
          console.log("\nFirst tag structure:");
          console.log(JSON.stringify(tags[0], null, 2));
        }
      }
      
      if ('data' in tagsResponse) {
        const data = (tagsResponse as any).data;
        console.log("Found 'data' property, type:", typeof data);
        if (data && typeof data === 'object') {
          console.log("Data keys:", Object.keys(data));
          if ('tags' in data && Array.isArray(data.tags) && data.tags.length > 0) {
            console.log("\nFirst tag from data.tags:");
            console.log(JSON.stringify(data.tags[0], null, 2));
          }
        }
      }
      
      // Log full response structure
      console.log("\n[4] Full response structure (first level):");
      console.log(JSON.stringify(tagsResponse, null, 2));
    }
    
    console.log("\n" + "=".repeat(60));
    console.log("Test completed successfully!");
    console.log("=".repeat(60));
    
  } catch (error) {
    console.error("\n❌ Error fetching tags:");
    console.error(error);
    
    if (error instanceof Error) {
      console.error("\nError message:", error.message);
      console.error("Error stack:", error.stack);
    }
  }
}

// Run the test
testViatorTags().catch(console.error);
