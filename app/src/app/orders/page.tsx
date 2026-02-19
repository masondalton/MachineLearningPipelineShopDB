"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCustomer } from "@/contexts/CustomerContext";
import { PageInstructions } from "@/components/PageInstructions";
import { apiUrl } from "@/lib/api";

interface Order {
  order_id: number;
  order_datetime: string;
  order_total: number;
  order_subtotal: number;
}

export default function OrderHistoryPage() {
  const { customer } = useCustomer();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customer) return;
    fetch(apiUrl(`/orders?customerId=${customer.customer_id}`))
      .then((r) => r.json())
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [customer]);

  if (!customer) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-6">
          <p className="text-slate-700">
            Please{" "}
            <Link href="/" className="font-medium text-blue-700 underline hover:text-blue-800">
              select a customer
            </Link>{" "}
            on the Customer Dashboard first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-slate-800">Order History</h1>

        <PageInstructions
          title="What this page shows"
          description="This page displays all orders for the customer you selected on the Customer Dashboard. Orders are loaded from the operational database (shop.db). New orders you place will appear here—they start as unfulfilled (no shipment) and can be scored for late-delivery risk on the Priority Queue page."
        />

        <p className="mb-4 text-slate-700">
          Orders for <strong className="text-slate-800">{customer.full_name}</strong>
        </p>
        <Link href="/" className="text-blue-700 underline hover:text-blue-800">
          Back to Customer Dashboard
        </Link>

        {loading ? (
          <p className="mt-4 text-slate-600">Loading...</p>
        ) : orders.length === 0 ? (
          <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
            No orders yet. Place an order from the Place Order page.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {orders.map((o) => (
              <div
                key={o.order_id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex justify-between text-slate-800">
                  <span className="font-medium">Order #{o.order_id}</span>
                  <span className="font-semibold">${o.order_total.toFixed(2)}</span>
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {new Date(o.order_datetime).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
