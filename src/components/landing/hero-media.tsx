"use client";

import * as React from "react";
import Image from "next/image";

export interface HeroMediaProps {
  hasVideo: boolean;
  videoSrc?: string;
  posterSrc?: string;
  photoSrc: string;
  isPhotoOptimized?: boolean;
}

/**
 * Editorial Hero Media Component:
 * - Autoplays muted looping video when available
 * - Automatically pauses video under prefers-reduced-motion
 * - Falls back to high-resolution photo with priority loading and zero layout shift
 */
export function HeroMedia({
  hasVideo,
  videoSrc = "/media/hero.mp4",
  posterSrc = "/media/hero-poster.svg",
  photoSrc,
  isPhotoOptimized = true,
}: HeroMediaProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    if (!hasVideo || !videoRef.current) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const handleMotionChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (!videoRef.current) return;
      if (e.matches) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => {});
      }
    };

    handleMotionChange(mediaQuery);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleMotionChange);
      return () => mediaQuery.removeEventListener("change", handleMotionChange);
    }
  }, [hasVideo]);

  if (hasVideo) {
    return (
      <video
        ref={videoRef}
        src={videoSrc}
        poster={posterSrc}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="h-full w-full object-cover object-center filter brightness-[0.82] saturate-[1.1]"
      />
    );
  }

  return (
    <Image
      src={photoSrc}
      alt="Masala Lane Indian feast background"
      fill
      priority
      sizes="100vw"
      unoptimized={!isPhotoOptimized}
      className="h-full w-full object-cover object-center filter brightness-[0.82] saturate-[1.1]"
    />
  );
}
