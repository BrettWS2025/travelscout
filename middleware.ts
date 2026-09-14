import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  SURFACE_HEADER,
  getConfiguredOperatorHost,
  isOperatorHost,
  operatorSubdomainEnabled,
  shouldRewriteToOperatorApp,
  toInternalOperatorPath,
  toPublicOperatorPath,
  type SiteSurface,
} from "@/lib/hosts";

function continueWithSurface(
  request: NextRequest,
  surface: SiteSurface,
  prepare?: (url: URL) => "rewrite" | "next"
) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(SURFACE_HEADER, surface);

  const url = request.nextUrl.clone();
  const mode = prepare?.(url) ?? "next";

  const response =
    mode === "rewrite"
      ? NextResponse.rewrite(url, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set(SURFACE_HEADER, surface);
  return response;
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const pathname = request.nextUrl.pathname;
  const onOperator = isOperatorHost(host);
  const subdomainOn = operatorSubdomainEnabled();

  if (onOperator) {
    if (pathname.startsWith("/operator")) {
      const publicPath = toPublicOperatorPath(pathname);
      const url = request.nextUrl.clone();
      url.pathname = publicPath;
      return NextResponse.redirect(url, 308);
    }

    if (shouldRewriteToOperatorApp(pathname)) {
      return continueWithSurface(request, "operator", (url) => {
        url.pathname = toInternalOperatorPath(pathname);
        return "rewrite";
      });
    }

    return continueWithSurface(request, "operator");
  }

  if (subdomainOn && (pathname === "/operator" || pathname.startsWith("/operator/"))) {
    const publicPath = toPublicOperatorPath(pathname);
    const operatorHost = getConfiguredOperatorHost()!;
    const url = request.nextUrl.clone();
    url.hostname = normalizeHostOnly(operatorHost);
    const port = operatorHost.includes(":") ? operatorHost.split(":")[1] : url.port;
    if (port) url.port = port;
    url.pathname = publicPath;
    return NextResponse.redirect(url, 308);
  }

  return continueWithSurface(request, "main");
}

function normalizeHostOnly(host: string): string {
  return host.split(":")[0].toLowerCase();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
