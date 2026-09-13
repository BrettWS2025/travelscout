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
} from "@/lib/hosts";

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
      const internal = toInternalOperatorPath(pathname);
      const url = request.nextUrl.clone();
      url.pathname = internal;
      const response = NextResponse.rewrite(url);
      response.headers.set(SURFACE_HEADER, "operator");
      return response;
    }

    const response = NextResponse.next();
    response.headers.set(SURFACE_HEADER, "operator");
    return response;
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

  const response = NextResponse.next();
  response.headers.set(SURFACE_HEADER, "main");
  return response;
}

function normalizeHostOnly(host: string): string {
  return host.split(":")[0].toLowerCase();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
