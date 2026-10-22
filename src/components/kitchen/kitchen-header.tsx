"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX, Maximize2, Minimize2, LogOut, Clock, ChefHat, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { unlockAudioContext } from "@/lib/sound";
import { authApi } from "@/lib/api/auth";
import type { StaffSession } from "@/lib/api/types";
import { useWakeLock } from "./use-wake-lock";

export interface KitchenHeaderProps {
  session: StaffSession;
  activeCounts: {
    new: number;
    preparing: number;
    ready: number;
  };
  soundEnabled: boolean;
  onToggleSound: (enabled: boolean) => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export function KitchenHeader({
  session,
  activeCounts,
  soundEnabled,
  onToggleSound,
  isRefreshing = false,
  onRefresh,
}: KitchenHeaderProps) {
  const [timeStr, setTimeStr] = React.useState("");
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const { isActive: wakeLockActive } = useWakeLock({ autoRequest: true });

  // Live digital clock
  React.useEffect(() => {
    const update = () => {
      setTimeStr(
        new Date().toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSoundClick = async () => {
    if (!soundEnabled) {
      await unlockAudioContext();
      onToggleSound(true);
    } else {
      onToggleSound(false);
    }
  };

  const handleFullscreenToggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const router = useRouter();

  const handleLogout = async () => {
    await authApi.logout();
    router.refresh();
  };

  return (
    <header className="h-16 bg-[#161412] border-b border-[#2C2825] px-4 flex items-center justify-between text-white select-none shrink-0">
      {/* Brand & Role */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary)] text-white shadow-md">
          <ChefHat className="h-6 w-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-lg sm:text-xl font-bold tracking-wide">
              {session.restaurantName}
            </h1>
            <Badge
              variant="outline"
              size="sm"
              className="text-xs uppercase font-mono tracking-wider border-zinc-700 text-zinc-300"
            >
              KDS Display
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-zinc-400 font-sans">
            Logged in as <b className="text-zinc-200 capitalize">{session.username}</b> ({session.role})
          </p>
        </div>
      </div>

      {/* Ticket Counter Pills */}
      <div className="hidden sm:flex items-center gap-2.5 bg-[#1F1C19] border border-[#2C2825] px-3.5 py-1.5 rounded-full text-sm font-mono">
        <span className="flex items-center gap-1.5 text-amber-400 font-bold">
          <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          {activeCounts.new} New
        </span>
        <span className="text-zinc-600">|</span>
        <span className="text-orange-400 font-bold">
          {activeCounts.preparing} Cooking
        </span>
        <span className="text-zinc-600">|</span>
        <span className="text-emerald-400 font-bold">
          {activeCounts.ready} Ready
        </span>
      </div>

        {/* Live Auto-Refresh Indicator & Action */}
        <div
          className="flex items-center gap-1.5 text-xs font-mono bg-[#1F1C19] border border-[#2C2825] px-2.5 py-1.5 rounded-md text-emerald-400"
          title="Kitchen board automatically refreshes every 3 seconds"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-emerald-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Click to refresh instantly"
            aria-label="Live Auto-Refresh: click to refresh tickets instantly"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden md:inline font-sans font-medium text-xs">Live Auto-Refresh</span>
          </button>
        </div>

      {/* Controls & Clock */}
      <div className="flex items-center gap-2.5">
        {/* Screen Wake Lock Indicator */}
        {wakeLockActive && (
          <div
            className="hidden xl:flex items-center gap-1.5 text-emerald-400 font-mono text-xs bg-emerald-950/60 border border-emerald-800/80 px-2.5 py-1.5 rounded-md"
            title="Screen stays on while viewing KDS"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Screen stays on</span>
          </div>
        )}

        {/* Live Clock */}
        <div className="hidden lg:flex items-center gap-1.5 text-zinc-200 font-mono text-sm bg-[#1F1C19] border border-[#2C2825] px-3.5 py-2 rounded-md font-semibold">
          <Clock className="h-4 w-4 text-zinc-400" />
          <span>{timeStr}</span>
        </div>

        {/* Audio Toggle (Autoplay Compliance) */}
        <button
          type="button"
          onClick={handleSoundClick}
          aria-label={soundEnabled ? "Chime ON" : "Enable Sound"}
          className={`flex items-center gap-1.5 min-h-[44px] px-3.5 text-sm font-semibold rounded-md border transition-all cursor-pointer ${
            soundEnabled
              ? "bg-emerald-950/80 text-emerald-300 border-emerald-600 shadow-xs"
              : "bg-[#25211D] text-zinc-400 border-[#38332D] hover:text-white"
          }`}
          title={soundEnabled ? "Audio Chime ON" : "Click to Enable Audio Chime"}
        >
          {soundEnabled ? (
            <>
              <Volume2 className="h-4 w-4 text-emerald-400" />
              <span className="hidden sm:inline">Chime ON</span>
            </>
          ) : (
            <>
              <VolumeX className="h-4 w-4 text-zinc-400" />
              <span>Enable Sound</span>
            </>
          )}
        </button>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={handleFullscreenToggle}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md bg-[#25211D] border border-[#38332D] text-zinc-300 hover:text-white cursor-pointer"
          title="Toggle Fullscreen"
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </button>

        {/* Logout */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          aria-label="Exit KDS"
          className="min-h-[44px] px-3.5 text-xs border-[#38332D] bg-[#25211D] text-zinc-300 hover:text-red-400 hover:bg-[#2C211E]"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline ml-1.5">Exit</span>
        </Button>
      </div>
    </header>
  );
}
