/** Host-based routing for the operator portal (subdomain) vs main traveler site. */

export const SURFACE_HEADER = "x-travelscout-surface";

export type SiteSurface = "main" | "operator";

export function normalizeHost(host: string): string {
  return host.split(":")[0].toLowerCase();
}

/** Subdomain hostname only, e.g. operators.travelscout.co.nz (no protocol). */
export function getConfiguredOperatorHost(): string | null {
  const raw = process.env.NEXT_PUBLIC_OPERATOR_HOST?.trim();
  if (!raw) return null;
  return normalizeHost(raw);
}

export function operatorSubdomainEnabled(): boolean {
  return getConfiguredOperatorHost() !== null;
}

export function isOperatorHost(host: string): boolean {
  const configured = getConfiguredOperatorHost();
  if (!configured) return false;
  return normalizeHost(host) === configured;
}

/** Internal Next.js path for operator UI (always under /operator). */
export function toInternalOperatorPath(publicPath: string): string {
  if (publicPath.startsWith("/operator")) return publicPath;
  if (publicPath === "/" || publicPath === "") return "/operator";
  return `/operator${publicPath.startsWith("/") ? publicPath : `/${publicPath}`}`;
}

/** Browser-facing path on the operator subdomain (no /operator prefix). */
export function toPublicOperatorPath(internalPath: string): string {
  if (!internalPath.startsWith("/operator")) return internalPath;
  const rest = internalPath.slice("/operator".length);
  return rest === "" ? "/" : rest;
}

export function isOperatorAppPath(pathname: string): boolean {
  return (
    pathname === "/operator" ||
    pathname.startsWith("/operator/") ||
    pathname === "/" ||
    pathname.startsWith("/organizations")
  );
}

export function shouldRewriteToOperatorApp(pathname: string): boolean {
  if (pathname.startsWith("/api") || pathname.startsWith("/auth")) return false;
  if (pathname.startsWith("/operator")) return true;
  if (pathname === "/") return true;
  if (pathname.startsWith("/organizations")) return true;
  return false;
}

/** Absolute URL to the operator portal (or /operator on same host when unset). */
export function operatorPortalUrl(publicPath = "/"): string {
  const host = getConfiguredOperatorHost();
  const path =
    publicPath === "/" ? "/" : publicPath.startsWith("/") ? publicPath : `/${publicPath}`;

  if (!host) {
    return toInternalOperatorPath(path);
  }

  const isLocal = host.includes("localhost");
  const protocol = isLocal ? "http" : "https";
  const port =
    isLocal && !host.includes(":") ? ":3000" : host.includes(":") ? `:${host.split(":")[1]}` : "";
  const hostname = normalizeHost(host);
  return `${protocol}://${hostname}${port}${path}`;
}

/** Traveler-site URL (absolute when NEXT_PUBLIC_SITE_URL is set). */
export function mainSiteUrl(path = "/"): string {
  const normalized =
    path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;

  let base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  // If SITE_URL is unset, derive the traveler host from operators.* so mobile
  // nav links on the operator subdomain still reach the main site.
  if (!base) {
    const operatorHost = getConfiguredOperatorHost();
    if (operatorHost?.startsWith("operators.")) {
      const derived = operatorHost.slice("operators.".length);
      const isLocal = derived.includes("localhost");
      const protocol = isLocal ? "http" : "https";
      const port =
        isLocal && !derived.includes(":")
          ? ":3000"
          : derived.includes(":")
            ? `:${derived.split(":")[1]}`
            : "";
      base = `${protocol}://${normalizeHost(derived)}${port}`;
    }
  }

  return base ? `${base}${normalized}` : normalized;
}

export function operatorHref(internalOrPublicPath: string, onOperatorHost: boolean): string {
  if (onOperatorHost) {
    if (internalOrPublicPath.startsWith("/operator")) {
      return toPublicOperatorPath(internalOrPublicPath);
    }
    return internalOrPublicPath.startsWith("/")
      ? internalOrPublicPath
      : `/${internalOrPublicPath}`;
  }
  if (internalOrPublicPath.startsWith("/operator")) return internalOrPublicPath;
  return toInternalOperatorPath(internalOrPublicPath);
}
