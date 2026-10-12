import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/demo"],
      disallow: ["/admin", "/kitchen", "/t/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
