import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { TripPlannerNavbar } from "@/components/TripPlannerNavbar";
import { Footer } from "@/components/Footer";
import { OperatorSiteChrome } from "@/components/OperatorSiteChrome";
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
        <main className="container py-8">{children}</main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <TripPlannerNavbar />
      <main className="container pt-[120px] pb-10">{children}</main>
      <Footer />
    </>
  );
}
