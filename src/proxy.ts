import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";

export function proxy(request?: NextRequest) {
  void request;
  const response = NextResponse.next();

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

  // Content-Security-Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://api.razorpay.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "frame-src 'self' https://checkout.razorpay.com https://api.razorpay.com",
    `connect-src 'self' https://checkout.razorpay.com https://api.razorpay.com ${supabaseOrigins}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  response.headers.set("Content-Security-Policy", cspDirectives.join("; "));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()"
  );

  // Strict-Transport-Security in production
  if (env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  // Frame protection matching frame-ancestors 'none'
  response.headers.set("X-Frame-Options", "DENY");

  return response;
}

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
