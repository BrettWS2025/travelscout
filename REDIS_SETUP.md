# Redis Setup Guide

## Quick Answer: Do You Need Both?

**No!** You only need **one** Redis instance:
- **Option 1**: Use Redis Cloud for everything (dev + production)
- **Option 2**: Use local Redis for development, Redis Cloud for production (recommended)

---

## Option 1: Redis Cloud Only (Simplest)

### Setup Steps:

1. **Get your Redis Cloud connection string:**
   - Log into [Redis Cloud](https://redis.com/cloud/)
   - Go to your database
   - Find the connection string (usually under "Connect" or "Configuration")
   - It will look like: `rediss://default:password@host:port`

2. **Add to `.env.local`:**
   ```env
   REDIS_URL=rediss://default:your_password@your_host:your_port
   ```

3. **Done!** Restart your dev server and caching will work.

**Pros:** Simple, no local setup needed  
**Cons:** Uses your Redis Cloud quota for development

---

## Option 2: Local Redis for Dev, Redis Cloud for Production (Recommended)

### Development Setup (Local Redis):

#### Using Docker (Easiest):

1. **Make sure Docker Desktop is installed and running**

2. **Start Redis:**
   ```bash
   npm run redis:start
   ```
   Or manually:
   ```bash
   docker-compose up -d redis
   ```

3. **Add to `.env.local`:**
   ```env
   REDIS_URL=redis://localhost:6379
   ```

4. **Verify it's running:**
   ```bash
   npm run redis:logs
   ```

5. **Stop Redis when done:**
   ```bash
   npm run redis:stop
   ```

#### Alternative: Using WSL (Windows Subsystem for Linux):

1. **Install WSL** (if not already installed):
   ```powershell
   wsl --install
   ```

2. **In WSL terminal:**
   ```bash
   sudo apt-get update
   sudo apt-get install redis-server
   redis-server
   ```

3. **Add to `.env.local`:**
   ```env
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

### Production Setup (Redis Cloud):

1. **Get your Redis Cloud connection string** (same as Option 1)

2. **Add to your production environment** (Vercel, Railway, etc.):
   - Go to your deployment platform's environment variables
   - Add: `REDIS_URL=rediss://default:password@host:port`

---

## Environment Variables Reference

### For Local Redis:
```env
# Option A: Using URL
REDIS_URL=redis://localhost:6379

# Option B: Using individual parameters
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=  # Leave empty if no password
```

### For Redis Cloud:
```env
# Use the connection string from Redis Cloud
REDIS_URL=rediss://default:password@host:port
```

**Note:** `rediss://` (with double 's') means SSL/TLS connection, which Redis Cloud typically uses.

---

## Testing Your Setup

1. **Start your local Redis** (if using Option 2):
   ```bash
   npm run redis:start
   ```

2. **Make sure `.env.local` has your Redis configuration**

3. **Start your Next.js dev server:**
   ```bash
   npm run dev
   ```

4. **Test the API:**
   ```bash
   npm run test:eventfinda
   ```

5. **Check Redis logs** (to see cache activity):
   ```bash
   npm run redis:logs
   ```

---

## Troubleshooting

### "Redis connection error"
- Make sure Redis is running: `docker ps` (should show redis container)
- Check your connection string is correct
- For local: Make sure port 6379 is not blocked

### "Connection refused"
- Redis isn't running - start it with `npm run redis:start`
- Check if port 6379 is already in use

### Cache not working?
- Check your `.env.local` file has the correct variables
- Restart your Next.js dev server after changing `.env.local`
- Check Redis logs: `npm run redis:logs`

---

## Useful Commands

```bash
# Start local Redis
npm run redis:start

# Stop local Redis (keeps data)
npm run redis:stop

# Stop and remove Redis container
npm run redis:down

# View Redis logs
npm run redis:logs

# Connect to Redis CLI (if you want to inspect cache)
docker exec -it travelscout-redis redis-cli
```

---

## Recommendation

**For development:** Use local Redis (Option 2) to:
- Save your Redis Cloud quota
- Work offline
- Faster (no network latency)
- Free to use

**For production:** Always use Redis Cloud (managed, reliable, scalable)
