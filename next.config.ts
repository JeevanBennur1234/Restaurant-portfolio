import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
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
