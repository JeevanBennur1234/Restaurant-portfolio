import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { QrCode, ArrowRight, ArrowLeft, ChefHat } from "lucide-react";

export default function DemoPage() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 max-w-lg mx-auto w-full text-center">
      <Card className="w-full text-left shadow-[var(--shadow-card)]">
        <CardHeader>
          <div className="flex items-center gap-2 text-[var(--accent)] mb-2">
            <QrCode className="h-4 w-4" />
            <span className="text-xs font-mono uppercase tracking-wider font-semibold">
              Live Demo Access
            </span>
          </div>
          <CardTitle>Masala Lane Dining & KDS</CardTitle>
          <CardDescription>
            Test the complete end-to-end demo: scan as a guest at Table 7, or open the live tablet kitchen display board to manage real-time cooking tickets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <Link href="/t/demo-table-7" className="block w-full">
            <Button
              variant="primary"
              size="lg"
              className="w-full justify-between shadow-md"
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Open Guest Ordering (Table 7)
            </Button>
          </Link>

          <Link href="/kitchen" className="block w-full">
            <Button
              variant="secondary"
              size="lg"
              className="w-full justify-between shadow-md"
              leftIcon={<ChefHat className="h-4 w-4" />}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Open Kitchen Display Board (/kitchen)
            </Button>
          </Link>

          <Link href="/admin" className="block w-full">
            <Button
              variant="outline"
              size="lg"
              className="w-full justify-between shadow-md"
              leftIcon={<QrCode className="h-4 w-4 text-[var(--primary)]" />}
              rightIcon={<ArrowRight className="h-4 w-4" />}
            >
              Open Manager Admin Hub (/admin)
            </Button>
          </Link>

          <Link href="/" className="block w-full">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              leftIcon={<ArrowLeft className="h-3.5 w-3.5" />}
            >
              Back to Overview
            </Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
