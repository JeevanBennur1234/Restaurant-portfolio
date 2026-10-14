import type { MetadataRoute } from "next";
import { env } from "@/server/env";
import { getSite } from "@/server/site";

export default function robots(): MetadataRoute.Robots {
  const site = getSite();

  if (site === "kitchen" || site === "manager") {
    return {
      rules: {
        userAgent: "*",
        disallow: ["/"],
      },
    };
  }

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
