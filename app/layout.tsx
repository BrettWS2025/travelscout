import "react-day-picker/dist/style.css"; // DayPicker first
import "../styles/globals.css";
import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next"; // optional
import { AuthProvider } from "@/components/AuthProvider"; // 👈 NEW

export default function RootLayout({ children }: { children: ReactNode }) {
  // Collect only on production. Remove this check if you also want Preview analytics.
  const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";

  return (
    <html lang="en">
      <body>
        {/* 👇 Everything that needs to know about auth lives inside here */}
        <AuthProvider>
          <Navbar />
          <main className="container pt-[160px] pb-10">{children}</main>
          <Footer />
          {isProd && <Analytics />}
          {isProd && <SpeedInsights />}
        </AuthProvider>
      </body>
    </html>
  );
}
