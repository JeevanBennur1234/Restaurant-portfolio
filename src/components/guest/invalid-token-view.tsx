import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { QrCode, AlertCircle, ArrowRight } from "lucide-react";

export interface InvalidTokenViewProps {
  reason?:
    | "INVALID_TOKEN"
    | "NOT_FOUND"
    | "INACTIVE_TABLE"
    | "Service temporarily unavailable";
}

export function InvalidTokenView({ reason = "NOT_FOUND" }: InvalidTokenViewProps) {
  const isInactive = reason === "INACTIVE_TABLE";
  const isServiceUnavailable = reason === "Service temporarily unavailable";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 py-16 max-w-md mx-auto w-full text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4 shadow-xs">
        {isInactive || isServiceUnavailable ? (
          <AlertCircle className="h-8 w-8" />
        ) : (
          <QrCode className="h-8 w-8" />
        )}
      </div>

      <Card className="w-full text-left border-[var(--border-strong)] shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="text-xs font-mono font-semibold text-[var(--destructive)] uppercase tracking-wider mb-1">
            {isServiceUnavailable
              ? "Service Error"
              : isInactive
              ? "Table Inactive"
              : "Invalid Table Code"}
          </div>
          <CardTitle className="text-xl">
            {isServiceUnavailable
              ? "Service Temporarily Unavailable"
              : isInactive
              ? "Table Currently Unavailable"
              : "QR Code Not Recognized"}
          </CardTitle>
          <CardDescription className="text-sm pt-1">
            {isServiceUnavailable
              ? "The database service is temporarily unavailable. Please refresh or try again in a moment."
              : isInactive
              ? "This dining table is currently marked as inactive or undergoing service. Please request our staff to activate this table."
              : "We could not find an active table session matching this link. Please re-scan the QR code placed on your dining table or request assistance from our floor captain."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <Link href="/" className="block w-full">
            <Button
              variant="primary"
              size="md"
              className="w-full justify-between shadow-xs"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Return to Masala Lane
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
