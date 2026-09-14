import Link from "next/link";
import { mainSiteUrl, operatorPortalUrl } from "@/lib/hosts";

type FooterProps = {
  /** On the operator subdomain, send traveler links to the main site. */
  travelerLinksToMainSite?: boolean;
};

export function Footer({ travelerLinksToMainSite = false }: FooterProps) {
  const href = (path: string) =>
    travelerLinksToMainSite ? mainSiteUrl(path) : path;

  return (
    <footer className="mt-0 border-t border-[var(--ts-ink)]/10 bg-[var(--ts-mist)] py-12">
      <div
        className="container grid gap-8 text-sm md:grid-cols-3"
        style={{ color: "var(--ts-muted)" }}
      >
        <div>
          <h3 className="mb-2 font-[family-name:var(--font-instrument)] text-lg text-[var(--ts-ink)]">
            TravelScout
          </h3>
          <p className="font-[family-name:var(--font-sora)] text-[var(--ts-muted)]">
            Showcase New Zealand. Find the deal that fits your place.
          </p>
        </div>
        <div>
          <h3 className="mb-2 font-[family-name:var(--font-sora)] font-semibold text-[var(--ts-ink)]">
            Legal
          </h3>
          <ul className="space-y-1 font-[family-name:var(--font-sora)]">
            <li>
              <Link className="link" href={href("/terms")}>
                Terms of Service
              </Link>
            </li>
            <li>
              <Link className="link" href={href("/privacy")}>
                Privacy
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h3 className="mb-2 font-[family-name:var(--font-sora)] font-semibold text-[var(--ts-ink)]">
            Connect
          </h3>
          <ul className="space-y-1 font-[family-name:var(--font-sora)]">
            <li>
              <a className="link" href="#">
                Instagram
              </a>
            </li>
            <li>
              <a className="link" href="#">
                YouTube
              </a>
            </li>
            <li>
              <a className="link" href={operatorPortalUrl("/")}>
                For operators
              </a>
            </li>
            <li>
              <Link className="link" href={href("/find-deals")}>
                Find deals
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="container mt-8 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
        © {new Date().getFullYear()} TravelScout
      </div>
    </footer>
  );
}
