import "react-day-picker/dist/style.css"; // DayPicker first
import "mapbox-gl/dist/mapbox-gl.css"; // Mapbox GL CSS - must be imported globally
import "../styles/globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next"; // optional
import { AuthProvider } from "@/components/AuthProvider"; // 👈 NEW
import { QueryProvider } from "@/components/QueryProvider";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://travelscout.co.nz";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "TravelScout | Plan Your New Zealand Journey",
    template: "%s | TravelScout",
  },
  description: "Plan your journey across Aotearoa with our intelligent trip planner. Book events and attractions along the way, and create the perfect itinerary tailored to your travel style.",
  keywords: ["New Zealand travel", "trip planner", "NZ road trip", "travel planning", "itinerary", "Aotearoa", "travel guide"],
  authors: [{ name: "TravelScout Ltd" }],
  creator: "TravelScout Ltd",
  publisher: "TravelScout Ltd",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_NZ",
    url: siteUrl,
    siteName: "TravelScout",
    title: "TravelScout | Plan Your New Zealand Journey",
    description: "Plan your journey across Aotearoa with our intelligent trip planner. Book events and attractions along the way, and create the perfect itinerary tailored to your travel style.",
    images: [
      {
        url: "/TravelScout-Main.png",
        width: 1200,
        height: 630,
        alt: "TravelScout - Plan Your New Zealand Journey",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TravelScout | Plan Your New Zealand Journey",
    description: "Plan your journey across Aotearoa with our intelligent trip planner.",
    images: ["/TravelScout-Main.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Collect only on production. Remove this check if you also want Preview analytics.
  const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TravelScout",
    legalName: "TravelScout Ltd",
    url: siteUrl,
    logo: `${siteUrl}/TravelScout-Main.png`,
    description: "Plan your journey across Aotearoa with our intelligent trip planner. Book events and attractions along the way, and create the perfect itinerary tailored to your travel style.",
    contactPoint: {
      "@type": "ContactPoint",
      email: "info@travelscout.co.nz",
      contactType: "Customer Service",
    },
    sameAs: [
      // Add social media links when available
    ],
  };

  const websiteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "TravelScout",
    url: siteUrl,
    description: "Plan your journey across Aotearoa with our intelligent trip planner.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en" className={plusJakartaSans.variable}>
      <head>
        <meta name="impact-site-verification" content="321bf81b-5895-4010-9e67-52c4f2342cc0" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData) }}
        />
      </head>
      <body>
        {/* 👇 Everything that needs to know about auth lives inside here */}
        <QueryProvider>
          <AuthProvider>
            <Navbar />
            <main className="container pt-[120px] pb-10">{children}</main>
            <Footer />
            {isProd && <Analytics />}
            {isProd && <SpeedInsights />}
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
