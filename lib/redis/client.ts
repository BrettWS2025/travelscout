import Redis from "ioredis";

// Use globalThis to persist across serverless function invocations
// This prevents creating multiple Redis connections in serverless environments
declare global {
  // eslint-disable-next-line no-var
  var __redisClient: Redis | null | undefined;
}

/**
 * Get or create Redis client instance
 * Uses singleton pattern with globalThis to reuse connection across requests
 * and prevent connection leaks in serverless environments
 */
export function getRedisClient(): Redis | null {
  // Return null if Redis is not configured (graceful degradation)
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    return null;
  }

  // Return existing client if already created (works across serverless invocations)
  if (global.__redisClient) {
    return global.__redisClient;
  }

  try {
    const commonConfig = {
      // Connection pool settings - limit to single connection to prevent leaks
      // ioredis uses connection pooling by default, but we want to minimize connections
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      // Keep connection alive to reuse across requests
      keepAlive: 30000, // 30 seconds
      // Disable offline queue to prevent connection buildup when disconnected
      enableOfflineQueue: false,
      // Connection timeout
      connectTimeout: 10000,
      // Retry strategy
      retryStrategy: (times: number) => {
        if (times > 3) {
          return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 200, 2000);
      },
    };

    // Prefer REDIS_URL if provided (works with Redis Cloud, Upstash, etc.)
    if (process.env.REDIS_URL) {
      const redisUrl = process.env.REDIS_URL;
      const isSSL = redisUrl.startsWith("rediss://");
      
      // Parse URL to extract components
      const url = new URL(redisUrl.replace(/^rediss?:\/\//, "redis://"));
      const password = url.password || undefined;
      const host = url.hostname;
      const port = parseInt(url.port || "6379", 10);
      
      global.__redisClient = new Redis({
        host,
        port,
        password,
        tls: isSSL ? {} : undefined, // Enable TLS for rediss:// URLs
        ...commonConfig,
      });
    } else {
      // Fallback to individual connection parameters
      const host = process.env.REDIS_HOST || "localhost";
      const port = parseInt(process.env.REDIS_PORT || "6379", 10);
      const password = process.env.REDIS_PASSWORD || undefined;
      const useTLS = process.env.REDIS_TLS === "true" || process.env.REDIS_TLS === "1";
      
      global.__redisClient = new Redis({
        host,
        port,
        password,
        tls: useTLS ? {} : undefined, // Enable TLS if REDIS_TLS is set
        ...commonConfig,
      });
    }

    // Handle connection errors gracefully
    global.__redisClient.on("error", (error) => {
      console.error("Redis connection error:", error);
      // Don't throw - allow app to continue without cache
    });

    global.__redisClient.on("connect", () => {
      console.log("Redis connected successfully");
    });

    // Clean up on disconnect to allow reconnection
    global.__redisClient.on("close", () => {
      console.log("Redis connection closed");
    });

    return global.__redisClient;
  } catch (error) {
    console.error("Failed to create Redis client:", error);
    return null;
  }
}

/**
 * Close Redis connection (useful for cleanup in tests or shutdown)
 */
export async function closeRedisConnection(): Promise<void> {
  if (global.__redisClient) {
    await global.__redisClient.quit();
    global.__redisClient = null;
  }
}
