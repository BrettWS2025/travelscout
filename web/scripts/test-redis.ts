/**
 * Test script to verify Redis connection and caching
 * 
 * Usage:
 *   npm run test:redis
 */

import { readFileSync } from "fs";
import { join } from "path";
import { getRedisClient } from "@/lib/redis/client";

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

async function testRedis() {
  console.log("Testing Redis connection...\n");

  // Check environment variables
  const hasRedisUrl = !!process.env.REDIS_URL;
  const hasRedisHost = !!process.env.REDIS_HOST;

  console.log("Environment variables:");
  console.log(`  REDIS_URL: ${hasRedisUrl ? "✓ Set" : "✗ Not set"}`);
  console.log(`  REDIS_HOST: ${hasRedisHost ? "✓ Set" : "✗ Not set"}`);
  console.log(`  REDIS_PORT: ${process.env.REDIS_PORT || "Not set (default: 6379)"}`);
  console.log(`  REDIS_PASSWORD: ${process.env.REDIS_PASSWORD ? "✓ Set" : "Not set"}`);
  console.log(`  REDIS_TLS: ${process.env.REDIS_TLS || "Not set"}\n`);

  if (!hasRedisUrl && !hasRedisHost) {
    console.error("❌ ERROR: No Redis configuration found!");
    console.error("Please set REDIS_URL or REDIS_HOST in .env.local");
    process.exit(1);
  }

  // Get Redis client
  const redis = getRedisClient();

  if (!redis) {
    console.error("❌ ERROR: Failed to create Redis client");
    process.exit(1);
  }

  try {
    // Test connection
    console.log("Attempting to connect to Redis...");
    
    // Try connecting - if it fails with SSL error, suggest trying without SSL
    try {
      await redis.connect();
      console.log("✓ Connected to Redis!\n");
    } catch (connectError: any) {
      if (connectError?.code === "ERR_SSL_PACKET_LENGTH_TOO_LONG" || 
          connectError?.message?.includes("packet length too long")) {
        console.error("\n⚠️  SSL/TLS connection failed. Your Redis Cloud instance might not use SSL.");
        console.error("💡 Try changing REDIS_URL from 'rediss://' to 'redis://' (remove one 's')");
        console.error("   Example: redis://default:password@host:port");
        throw connectError;
      }
      throw connectError;
    }

    // Test write
    console.log("Testing write operation...");
    const testKey = "test:connection";
    const testValue = `test-${Date.now()}`;
    await redis.set(testKey, testValue, "EX", 60); // Expire in 60 seconds
    console.log(`✓ Successfully wrote to Redis (key: ${testKey})\n`);

    // Test read
    console.log("Testing read operation...");
    const retrieved = await redis.get(testKey);
    if (retrieved === testValue) {
      console.log(`✓ Successfully read from Redis (value: ${retrieved})\n`);
    } else {
      console.error(`❌ ERROR: Value mismatch! Expected: ${testValue}, Got: ${retrieved}`);
      process.exit(1);
    }

    // Test cache key format (like Eventfinda API uses)
    console.log("Testing Eventfinda cache key format...");
    const cacheKey = "eventfinda:test123";
    const cacheData = { success: true, count: 5, events: [] };
    await redis.setex(cacheKey, 60, JSON.stringify(cacheData));
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      console.log(`✓ Successfully cached and retrieved data (count: ${parsed.count})\n`);
    } else {
      console.error("❌ ERROR: Failed to retrieve cached data");
      process.exit(1);
    }

    // Cleanup test key
    await redis.del(testKey);
    await redis.del(cacheKey);
    console.log("✓ Cleaned up test keys\n");

    console.log("✅ All Redis tests passed!");
    console.log("\nRedis is properly configured and working.");
    console.log("Your Eventfinda API caching should be functional.");

    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR: Redis connection or operation failed");
    console.error("Error details:", error instanceof Error ? error.message : error);
    
    if (error instanceof Error) {
      if (error.message.includes("ECONNREFUSED")) {
        console.error("\n💡 Tip: Make sure Redis is running and accessible");
      } else if (error.message.includes("NOAUTH")) {
        console.error("\n💡 Tip: Check your REDIS_PASSWORD in .env.local");
      } else if (error.message.includes("ENOTFOUND")) {
        console.error("\n💡 Tip: Check your REDIS_HOST or REDIS_URL is correct");
      }
    }
    
    process.exit(1);
  }
}

testRedis();
