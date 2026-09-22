# Mapbox GL JS Setup Instructions

This guide will help you set up Mapbox GL JS for your TravelScout application.

## Why Mapbox GL JS?

Mapbox GL JS provides:
- **Better visual quality**: More polished, modern map styling
- **Better performance**: Hardware-accelerated rendering
- **More customization**: Extensive styling options and custom map styles
- **Better mobile experience**: Smooth interactions and gestures

## Step 1: Get a Mapbox Access Token

1. **Create a Mapbox account** (if you don't have one):
   - Go to [https://account.mapbox.com/signup/](https://account.mapbox.com/signup/)
   - Sign up for a free account

2. **Get your access token**:
   - After signing up, go to [https://account.mapbox.com/access-tokens/](https://account.mapbox.com/access-tokens/)
   - You'll see your **Default public token** - this is what you'll use for development
   - For production, create a new token with appropriate scopes (or use the default one)

3. **Note your token**: Copy the token - you'll need it in the next step

## Step 2: Configure Environment Variables

1. **Create or update `.env.local`** in your project root:
   ```bash
   # If the file doesn't exist, create it
   touch .env.local
   ```

2. **Add your Mapbox token**:
   ```env
   NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
   ```

   Replace `your_mapbox_token_here` with your actual Mapbox access token.

3. **Restart your development server**:
   ```bash
   npm run dev
   ```

   Environment variables are only loaded when the server starts, so you need to restart.

## Step 3: Verify the Setup

1. **Start your development server** (if not already running):
   ```bash
   npm run dev
   ```

2. **Navigate to a page with a map** (e.g., `/trip-planner`)

3. **Check the browser console**:
   - If you see a warning about the missing token, double-check your `.env.local` file
   - If the map loads successfully, you're all set!

## Step 4: Production Deployment

When deploying to production (Vercel, Netlify, etc.):

1. **Add the environment variable** in your hosting platform's dashboard:
   - Variable name: `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`
   - Variable value: Your Mapbox access token

2. **Redeploy** your application

### Vercel Example:
- Go to your project settings → Environment Variables
- Add `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` with your token value
- Redeploy

## Mapbox Pricing

- **Free tier**: 50,000 map loads per month
- **Pay-as-you-go**: $0.50 per 1,000 additional map loads
- For most development and small-to-medium applications, the free tier is sufficient

## Customization Options

The current implementation uses the default `streets-v12` style. You can customize the map style by:

1. **Using a different built-in style**:
   - `mapbox://styles/mapbox/streets-v12` (default)
   - `mapbox://styles/mapbox/outdoors-v12`
   - `mapbox://styles/mapbox/light-v11`
   - `mapbox://styles/mapbox/dark-v11`
   - `mapbox://styles/mapbox/satellite-v9`
   - `mapbox://styles/mapbox/satellite-streets-v12`

2. **Creating a custom style**:
   - Use [Mapbox Studio](https://studio.mapbox.com/) to create custom styles
   - Use your custom style URL in the `mapStyle` prop

3. **Modify the component**:
   - Edit `components/TripMap.tsx`
   - Change the `mapStyle` prop in the `Map` component

## Troubleshooting

### Map doesn't load
- **Check your token**: Verify `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is set correctly
- **Check the console**: Look for error messages
- **Restart dev server**: Environment variables require a restart

### "Invalid token" error
- Verify your token is correct in `.env.local`
- Make sure there are no extra spaces or quotes
- Check that the token hasn't been revoked in your Mapbox account

### Map shows but route doesn't appear
- Check browser console for errors
- Verify OSRM routing service is accessible (used for route geometry)
- The route will only appear if you have 2+ points

## What Changed?

The migration from Leaflet to Mapbox GL JS:
- ✅ Replaced `react-leaflet` with `react-map-gl`
- ✅ Replaced `leaflet-routing-machine` with OSRM API for route geometry
- ✅ Maintained all existing functionality (markers, routes, popups)
- ✅ Kept the same component interface (no changes needed in parent components)
- ✅ Improved visual quality and performance

## Next Steps

- Consider customizing the map style to match your brand
- Explore Mapbox GL JS features like 3D buildings, custom layers, etc.
- Monitor your Mapbox usage in the [Mapbox dashboard](https://account.mapbox.com/)
