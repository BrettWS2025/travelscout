import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://travelscout.co.nz";
  const baseUrl = siteUrl;

  const routes = [
    "",
    "/trip-planner",
    "/guides",
    "/tips",
    "/top-deals",
    "/compare",
    "/compare/travel-insurance",
    "/compare/cruise",
    "/compare/best-time-to-book",
    "/compare/travel-agencies-otas-and-direct",
    "/privacy",
    "/terms",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" ? "weekly" : "monthly" as const,
    priority: route === "" ? 1 : 0.8,
  }));
}
