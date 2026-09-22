import "../styles/globals.css";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { Instrument_Serif, Sora } from "next/font/google";
import { SiteShell } from "@/components/SiteShell";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next"; // optional
import { AuthProvider } from "@/components/AuthProvider"; // 👈 NEW

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://travelscout.co.nz";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SCOUT | by travelscout",
    template: "%s | SCOUT",
  },
  description:
    "Showcase New Zealand destinations and events, then find deals by place. TravelScout helps you travel smarter across Aotearoa.",
  keywords: [
    "New Zealand travel",
    "travel deals",
    "NZ destinations",
    "Aotearoa",
    "travel guide",
    "find deals",
  ],
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
    title: "SCOUT | by travelscout",
    description:
      "Showcase New Zealand destinations and events, then find deals by place.",
    images: [
      {
        url: "/TravelScout-Main.png",
        width: 1200,
        height: 630,
        alt: "SCOUT by travelscout",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SCOUT | by travelscout",
    description:
      "Showcase New Zealand destinations and events, then find deals by place.",
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
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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
    description:
      "Showcase New Zealand destinations and events, then find deals by place across Aotearoa.",
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
    description:
      "Showcase New Zealand destinations and events, then find deals by place.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/find-deals?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="en" className={`${instrumentSerif.variable} ${sora.variable}`}>
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
        <AuthProvider>
          <SiteShell>{children}</SiteShell>
          {isProd && <Analytics />}
          {isProd && <SpeedInsights />}
        </AuthProvider>
      </body>
    </html>
  );
}
