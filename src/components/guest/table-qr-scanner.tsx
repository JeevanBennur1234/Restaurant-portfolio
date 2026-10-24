"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Camera, QrCode, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractTableTokenFromQr } from "@/lib/table-qr";

type ScannerControls = { stop: () => void };

export function TableQrScanner() {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const controlsRef = React.useRef<ScannerControls | null>(null);
  const handledResultRef = React.useRef(false);
  const scanAttemptIdRef = React.useRef(0);
  const [isOpen, setIsOpen] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const [isScanning, setIsScanning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("Point your camera at the QR code on your table.");

  const stopScanner = React.useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setIsStarting(false);
    setIsScanning(false);
  }, []);

  React.useEffect(() => () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  const startScanner = async () => {
    if (isStarting || controlsRef.current) return;
    const attemptId = ++scanAttemptIdRef.current;
    setError(null);
    setStatus("Starting your camera…");
    setIsStarting(true);
    setIsOpen(true);
    handledResultRef.current = false;

    try {
      // Let React mount the video element before attaching the camera stream.
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (!videoRef.current) {
        throw new Error("Could not initialize the camera preview. Please try again or enter the table code below.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not available in this browser. Please enter the table code below.");
      }
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, _scanError, callbackControls) => {
          if (attemptId !== scanAttemptIdRef.current || !result || handledResultRef.current) return;
          const token = extractTableTokenFromQr(result.getText());
          if (!token) {
            setError("That QR code is not a Masala Lane table link. Scan the QR printed on your table standee.");
            return;
          }

          handledResultRef.current = true;
          callbackControls.stop();
          controlsRef.current = null;
          setStatus("Table found. Opening your menu…");
          setIsStarting(false);
          setIsScanning(false);
          router.push(`/t/${encodeURIComponent(token)}`);
        }
      );

      if (attemptId !== scanAttemptIdRef.current || handledResultRef.current) {
        controls.stop();
      } else {
        controlsRef.current = controls;
        setIsScanning(true);
        setStatus("Camera is ready. Hold the table QR inside the frame.");
      }
    } catch (scanError) {
      if (attemptId !== scanAttemptIdRef.current) return;
      stopScanner();
      const err = scanError as { name?: string; message?: string };
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("Camera permission was denied. Allow camera access in your browser, or enter the table code below.");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("No camera was found on this device. Enter the table code below instead.");
      } else {
        setError(err.message || "Could not start the camera scanner. Please enter the table code below.");
      }
      setStatus("Scanner unavailable.");
    }
  };

  const closeScanner = () => {
    scanAttemptIdRef.current += 1;
    stopScanner();
    setIsOpen(false);
    setError(null);
    setStatus("Point your camera at the QR code on your table.");
  };

  return (
    <div className="space-y-3" data-testid="table-qr-scanner">
      <Button
        type="button"
        variant="primary"
        size="md"
        onClick={startScanner}
        disabled={isStarting || isScanning}
        data-testid="open-table-qr-scanner"
        className="w-full min-h-[48px] justify-center gap-2"
        leftIcon={<Camera className="h-4 w-4" />}
      >
        Scan Table QR with Camera
      </Button>

      {isOpen && (
        <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)] p-3" data-testid="table-qr-scanner-panel">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
              <QrCode className="h-4 w-4 text-[var(--primary)]" />
              Table QR Scanner
            </div>
            <button type="button" onClick={closeScanner} aria-label="Close camera scanner" className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--bg-surface)]">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative overflow-hidden rounded-lg bg-[#171310] aspect-[4/3]">
            <video ref={videoRef} muted playsInline autoPlay className="h-full w-full object-cover" aria-label="Live camera preview for scanning the table QR" />
            <div className="pointer-events-none absolute inset-[14%] rounded-xl border-2 border-[#F4A261] shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" />
          </div>
          <p role="status" className="text-xs text-[var(--text-secondary)]">{status}</p>
          {error && (
            <p role="alert" className="flex items-start gap-2 text-xs text-[var(--destructive)]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">Camera frames are decoded in your browser; images are not uploaded. Camera access requires permission and a secure HTTPS connection (localhost is supported for development).</p>
        </div>
      )}
    </div>
  );
}
