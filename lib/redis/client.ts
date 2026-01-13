import Redis from "ioredis";

let redis: Redis | null = null;

/**
 * Get or create Redis client instance
 * Uses singleton pattern to reuse connection across requests
 */
export function getRedisClient(): Redis | null {
  // Return null if Redis is not configured (graceful degradation)
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    return null;
  }

  // Return existing client if already created
  if (redis) {
    return redis;
  }

  try {
    // Prefer REDIS_URL if provided (works with Redis Cloud, Upstash, etc.)
    if (process.env.REDIS_URL) {
      const redisUrl = process.env.REDIS_URL;
      const isSSL = redisUrl.startsWith("rediss://");
      
      // Parse URL to extract components
      const url = new URL(redisUrl.replace(/^rediss?:\/\//, "redis://"));
      const password = url.password || undefined;
      const host = url.hostname;
      const port = parseInt(url.port || "6379", 10);
      
      redis = new Redis({
        host,
        port,
        password,
        tls: isSSL ? {} : undefined, // Enable TLS for rediss:// URLs
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
        // Additional options for Redis Cloud
        connectTimeout: 10000,
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying after 3 attempts
          }
          return Math.min(times * 200, 2000);
        },
      });
    } else {
      // Fallback to individual connection parameters
      const host = process.env.REDIS_HOST || "localhost";
      const port = parseInt(process.env.REDIS_PORT || "6379", 10);
      const password = process.env.REDIS_PASSWORD || undefined;
      const useTLS = process.env.REDIS_TLS === "true" || process.env.REDIS_TLS === "1";
      
      redis = new Redis({
        host,
        port,
        password,
        tls: useTLS ? {} : undefined, // Enable TLS if REDIS_TLS is set
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
    }

    // Handle connection errors gracefully
    redis.on("error", (error) => {
      console.error("Redis connection error:", error);
      // Don't throw - allow app to continue without cache
    });

    redis.on("connect", () => {
      console.log("Redis connected successfully");
    });

    return redis;
  } catch (error) {
    console.error("Failed to create Redis client:", error);
    return null;
  }
}

/**
 * Close Redis connection (useful for cleanup in tests or shutdown)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
