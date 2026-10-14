import type { NextConfig } from "next";

const site = process.env.SITE || "all";
const isDev = process.env.NODE_ENV === "development";
const distDir = isDev && site !== "all" ? `.next-${site}` : ".next";

const nextConfig: NextConfig = {
  distDir,
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL
        ? (() => {
            try {
              const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
              if (url.hostname.endsWith(".supabase.co")) return [];
              return [
                {
                  protocol: (url.protocol.replace(":", "") || "https") as "http" | "https",
                  hostname: url.hostname,
                  port: url.port || undefined,
                },
              ];
            } catch {
              return [];
            }
          })()
        : []),
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
