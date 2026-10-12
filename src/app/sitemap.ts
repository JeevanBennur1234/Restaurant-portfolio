import type { MetadataRoute } from "next";
import { env } from "@/server/env";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/demo`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
}
