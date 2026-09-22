import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { OperatorMain } from "@/components/operator/OperatorMain";
import { MarketingMain } from "@/components/MarketingMain";
import {
  SURFACE_HEADER,
  isOperatorHost,
  type SiteSurface,
} from "@/lib/hosts";

function getSurface(): SiteSurface {
  const h = headers();
  if (h.get(SURFACE_HEADER) === "operator") return "operator";

  // Fallback: middleware may not forward the custom header in every deploy path.
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  if (isOperatorHost(host)) return "operator";

  return "main";
}

export function SiteShell({ children }: { children: ReactNode }) {
  const surface = getSurface();

  // Operator portal uses the exact same top pill + mobile menu + footer as home.
  // Do not use OperatorSiteChrome — it had different links and no footer.
  if (surface === "operator") {
    return (
      <>
        <Navbar travelerLinksToMainSite />
        <OperatorMain>{children}</OperatorMain>
        <Footer travelerLinksToMainSite />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <MarketingMain>{children}</MarketingMain>
      <Footer />
    </>
  );
}
