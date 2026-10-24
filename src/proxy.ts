import { NextResponse, type NextRequest } from "next/server";
import { env, validateFrameAncestors } from "@/server/env";
import { getSite, type Site } from "@/server/site";

export function isAlwaysAllowed(pathname: string): boolean {
  if (
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/opengraph-image") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname.startsWith("/media/") ||
    pathname.startsWith("/images/") ||
    pathname === "/api/v1/health" ||
    pathname === "/_not-found"
  ) {
    return true;
  }
  return false;
}

export function routeDecisionForSite(
  site: Site,
  pathname: string
): { allowed: boolean; rewriteTo?: string } {
  if (isAlwaysAllowed(pathname)) {
    return { allowed: true };
  }

  if (site === "all") {
    return { allowed: true };
  }

  if (site === "customer") {
    const isCustomerPath =
      pathname === "/" ||
      pathname === "/order" ||
      pathname === "/order/" ||
      pathname === "/t" ||
      pathname === "/t/" ||
      pathname.startsWith("/t/") ||
      pathname === "/api/v1/customer" ||
      pathname.startsWith("/api/v1/customer/") ||
      pathname === "/api/v1/openapi.json" ||
      pathname === "/api/webhooks/razorpay";

    return { allowed: isCustomerPath };
  }

  if (site === "kitchen") {
    if (pathname === "/") {
      return { allowed: true, rewriteTo: "/kitchen" };
    }
    const isKitchenPath =
      pathname === "/kitchen" ||
      pathname.startsWith("/kitchen/") ||
      pathname === "/api/v1/kitchen" ||
      pathname.startsWith("/api/v1/kitchen/") ||
      pathname === "/api/v1/auth" ||
      pathname.startsWith("/api/v1/auth/");

    return { allowed: isKitchenPath };
  }

  if (site === "manager") {
    if (pathname === "/") {
      return { allowed: true, rewriteTo: "/admin" };
    }
    const isManagerPath =
      pathname === "/admin" ||
      pathname.startsWith("/admin/") ||
      pathname === "/api/v1/admin" ||
      pathname.startsWith("/api/v1/admin/") ||
      pathname === "/api/admin" ||
      pathname.startsWith("/api/admin/") ||
      pathname === "/api/v1/auth" ||
      pathname.startsWith("/api/v1/auth/");

    return { allowed: isManagerPath };
  }

  return { allowed: false };
}

export function proxy(request?: NextRequest) {
  if (!request) {
    return NextResponse.next();
  }

  const site = getSite();
  const pathname = request.nextUrl.pathname;
  const decision = routeDecisionForSite(site, pathname);

  let response: NextResponse;
  if (!decision.allowed) {
    const notFoundUrl = new URL("/_not-found", request.url);
    response = NextResponse.rewrite(notFoundUrl, { status: 404 });
  } else if (decision.rewriteTo) {
    const rewriteUrl = new URL(decision.rewriteTo, request.url);
    response = NextResponse.rewrite(rewriteUrl);
  } else {
    response = NextResponse.next();
  }

  // Supabase URL for connect-src (HTTPS and WSS)
  let supabaseOrigins = "https://*.supabase.co wss://*.supabase.co";
  if (
    env.NEXT_PUBLIC_SUPABASE_URL &&
    !env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    try {
      const parsed = new URL(env.NEXT_PUBLIC_SUPABASE_URL);
      const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
      supabaseOrigins = `${parsed.origin} ${wsProtocol}//${parsed.host} https://*.supabase.co wss://*.supabase.co`;
    } catch {
      // Keep wildcard default if unparseable
    }
  }

  // Frame ancestors parsing
  const rawFrameAncestors = process.env.FRAME_ANCESTORS || env.FRAME_ANCESTORS;
  let frameAncestorsOrigins: string[] = [];
  let hasValidFrameAncestors = false;
  if (rawFrameAncestors && rawFrameAncestors.trim().length > 0) {
    const parsed = validateFrameAncestors(
      rawFrameAncestors,
      env.NODE_ENV === "production"
    );
    if (parsed.valid && parsed.origins.length > 0) {
      frameAncestorsOrigins = parsed.origins;
      hasValidFrameAncestors = true;
    }
  }

  const frameAncestorsDirective =
    frameAncestorsOrigins.length > 0
      ? `frame-ancestors 'self' ${frameAncestorsOrigins.join(" ")}`
      : "frame-ancestors 'self'";

  // Content-Security-Policy
  const scriptSrcDirectives = [
    "'self'",
    "'unsafe-inline'",
    ...(env.NODE_ENV === "production" ? [] : ["'unsafe-eval'"]),
    "https://checkout.razorpay.com",
    "https://api.razorpay.com",
  ].join(" ");

  // Frame-src origins: allow checkout plus configured site origins
  const frameSrcOrigins: string[] = [
    "'self'",
    "https://checkout.razorpay.com",
    "https://api.razorpay.com",
  ];

  const siteOriginsToCheck = [
    process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || env.NEXT_PUBLIC_CUSTOMER_SITE_URL,
    process.env.NEXT_PUBLIC_KITCHEN_SITE_URL || env.NEXT_PUBLIC_KITCHEN_SITE_URL,
    process.env.NEXT_PUBLIC_MANAGER_SITE_URL || env.NEXT_PUBLIC_MANAGER_SITE_URL,
  ];

  for (const raw of siteOriginsToCheck) {
    if (raw) {
      try {
        const u = new URL(raw);
        if (!frameSrcOrigins.includes(u.origin)) {
          frameSrcOrigins.push(u.origin);
        }
      } catch {}
    }
  }

  const cspDirectives = [
    "default-src 'self'",
    `script-src ${scriptSrcDirectives}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self'",
    `frame-src ${frameSrcOrigins.join(" ")}`,
    `connect-src 'self' https://checkout.razorpay.com https://api.razorpay.com ${supabaseOrigins}`,
    frameAncestorsDirective,
    "base-uri 'self'",
    "form-action 'self'",
  ];

  response.headers.set("Content-Security-Policy", cspDirectives.join("; "));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(), geolocation=(), browsing-topics=()"
  );

  // Strict-Transport-Security in production
  if (env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  // Frame protection:
  // When FRAME_ANCESTORS is set, do NOT send X-Frame-Options (the CSP covers it);
  // when unset keep X-Frame-Options: SAMEORIGIN.
  if (hasValidFrameAncestors) {
    response.headers.delete("X-Frame-Options");
  } else {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  // Kitchen and manager sites: add X-Robots-Tag: noindex, nofollow, noarchive
  if (site === "kitchen" || site === "manager") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return response;
}

export const middleware = proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (static assets)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
