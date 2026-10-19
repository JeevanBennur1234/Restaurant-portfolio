import type { Metadata } from "next";
import { connection } from "next/server";
import Link from "next/link";
import { db } from "@/server/db";
import { getOrder } from "@/server/services/customer";
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
  // The tracker title depends on live order data; render this metadata at request time.
  await connection();
  const { id, token } = await params;
  const result = await getOrder({ db }, { orderId: id, token });

  if (!result.ok || !result.data) {
    return {
      title: "Order Not Found | Masala Lane",
      description: "Live table order tracking.",
    };
  }

  const order = result.data;

  return {
    title: `Order #${order.orderNumber} (${order.tableNumber}) | ${order.restaurantName}`,
    description: `Live order status tracker for ${order.tableNumber} at ${order.restaurantName}.`,
  };
}

export default async function GuestOrderTrackerPage({ params }: OrderPageProps) {
  await connection();
  const { id, token } = await params;
  const result = await getOrder({ db }, { orderId: id, token });

  if (!result.ok || !result.data) {
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

  const order = result.data;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)]">
      <GuestHeader
        restaurantName={order.restaurantName}
        tableLabel={order.tableNumber}
      />
      <OrderLiveTracker
        initialOrder={order}
        token={token}
      />
    </div>
  );
}
