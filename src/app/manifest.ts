import type { MetadataRoute } from "next";
import { getSite } from "@/server/site";

export default function manifest(): MetadataRoute.Manifest {
  const site = getSite();
  const siteName = process.env.NEXT_PUBLIC_SITE_NAME;

  if (site === "kitchen") {
    return {
      name: "DinePulse Kitchen",
      short_name: "Kitchen",
      description: "Kitchen Display System for live order dispatch and ticket management",
      start_url: "/",
      display: "standalone",
      orientation: "landscape",
      background_color: "#110F0E",
      theme_color: "#110F0E",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    };
  }

  if (site === "manager") {
    return {
      name: siteName || "DinePulse Manager Console",
      short_name: siteName || "Manager",
      description: "Manager Console for menu management, operations, and analytics",
      start_url: "/admin",
      display: "standalone",
      orientation: "any",
      background_color: "#FAF7F2",
      theme_color: "#D97706",
      icons: [
        {
          src: "/icons/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "/icons/icon-512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    };
  }

  return {
    name: siteName || "DinePulse · Masala Lane",
    short_name: siteName || "DinePulse",
    description: "App-free digital ordering, payment, and live order tracking",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FAF7F2",
    theme_color: "#D97706",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
