import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { TripPlannerNavbar } from "@/components/TripPlannerNavbar";
import { Footer } from "@/components/Footer";
import { OperatorSiteChrome } from "@/components/OperatorSiteChrome";
import { OperatorMain } from "@/components/operator/OperatorMain";
import { MarketingMain } from "@/components/MarketingMain";
import { SURFACE_HEADER, type SiteSurface } from "@/lib/hosts";

function getSurface(): SiteSurface {
  const h = headers();
  return h.get(SURFACE_HEADER) === "operator" ? "operator" : "main";
}

export function SiteShell({ children }: { children: ReactNode }) {
  const surface = getSurface();

  if (surface === "operator") {
    return (
      <>
        <OperatorSiteChrome />
        <OperatorMain>{children}</OperatorMain>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <TripPlannerNavbar />
      <MarketingMain>{children}</MarketingMain>
      <Footer />
    </>
  );
}
