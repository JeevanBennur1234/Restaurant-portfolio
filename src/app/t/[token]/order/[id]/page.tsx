import type { Metadata } from "next";
import Link from "next/link";
import { getOrderDetailsAction } from "@/server/actions/order";
import { env } from "@/server/env";
import { GuestHeader } from "@/components/guest/guest-header";
import { OrderLiveTracker } from "@/components/guest/order-live-tracker";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, AlertCircle } from "lucide-react";

interface OrderPageProps {
  params: Promise<{
    token: string;
    id: string;
  }>;
}

export async function generateMetadata({
  params,
}: OrderPageProps): Promise<Metadata> {
  const { id, token } = await params;
  const result = await getOrderDetailsAction(id, token);

  if (!result.success || !result.order) {
    return {
      title: "Order Not Found | Masala Lane",
      description: "Live table order tracking.",
    };
  }

  return {
    title: `Order #${result.order.orderNumber} (${result.order.tableNumber}) | ${result.order.restaurantName}`,
    description: `Live order status tracker for ${result.order.tableNumber} at ${result.order.restaurantName}.`,
  };
}

export default async function GuestOrderTrackerPage({ params }: OrderPageProps) {
  const { id, token } = await params;
  const result = await getOrderDetailsAction(id, token);

  if (!result.success || !result.order) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 py-16 max-w-md mx-auto w-full text-center">
        <Card className="w-full text-left">
          <CardHeader>
            <div className="flex items-center gap-2 text-[var(--destructive)] mb-2">
              <AlertCircle className="h-5 w-5" />
              <span className="text-xs font-mono uppercase tracking-wider font-semibold">
                Order Lookup Failed
              </span>
            </div>
            <CardTitle>Order Not Found</CardTitle>
            <CardDescription>
              We could not locate this order for your current table session. Please return to the menu or consult your server.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/t/${token}`}>
              <Button variant="outline" size="md" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Return to Table Menu
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { order } = result;
  const isDemoMode = env.DEMO_MODE === "true";

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)]">
      <GuestHeader
        restaurantName={order.restaurantName}
        tableLabel={order.tableNumber}
      />
      <OrderLiveTracker
        initialOrder={order}
        token={token}
        isDemoMode={isDemoMode}
      />
    </div>
  );
}
