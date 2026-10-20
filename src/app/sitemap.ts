import type { MetadataRoute } from "next";
import { env } from "@/server/env";
import { getSite } from "@/server/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const site = getSite();

  if (site === "kitchen" || site === "manager") {
    return [];
  }

  const baseUrl = env.APP_URL.replace(/\/$/, "");
  const now = new Date();

  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
  ];
}
