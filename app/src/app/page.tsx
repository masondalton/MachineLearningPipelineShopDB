"use client";

import Link from "next/link";
import { useCustomer } from "@/contexts/CustomerContext";
import { PageInstructions } from "@/components/PageInstructions";

export default function CustomerDashboard() {
  const { customer, setCustomer, customers, loading, error } = useCustomer();

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold text-slate-800">
          Customer Dashboard
        </h1>

        <PageInstructions
          title="How to use this page"
          description="This is the customer selection screen for testing. Choose a customer to act as—your selection is saved in a cookie so it persists across page visits and helps associate your test orders with the right customer for predictions."
          steps={[
            "Select a customer from the dropdown below (required before Place Order or Order History)",
            "Place Order: Create a new order as the selected customer; the order is saved to shop.db with no shipment (unfulfilled)",
            "Order History: View all orders for the selected customer",
            "Priority Queue: View the warehouse late-delivery ranking—no customer selection needed",
          ]}
        />

        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <label
            htmlFor="customer-select"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Select Customer
          </label>
          {loading ? (
            <p className="text-slate-600">Loading customers...</p>
          ) : error ? (
            <p className="text-red-600">{error}</p>
          ) : (
            <select
              id="customer-select"
              value={customer?.customer_id ?? ""}
              onChange={(e) => {
                const id = e.target.value ? parseInt(e.target.value, 10) : null;
                const found = customers.find((c) => c.customer_id === id);
                setCustomer(found ?? null);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Choose a customer —</option>
              {customers.map((c) => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.full_name} ({c.email})
                  {[c.city, c.state].filter(Boolean).length > 0 &&
                    ` — ${[c.city, c.state].filter(Boolean).join(", ")}`}
                </option>
              ))}
            </select>
          )}
          {customer && (
            <p className="mt-3 text-sm text-slate-600">
              Acting as: <strong className="text-slate-800">{customer.full_name}</strong>.
              Your choice is stored in a cookie.
            </p>
          )}
        </div>

        {customer && (
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/orders/new"
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white shadow hover:bg-blue-700"
            >
              Place Order
            </Link>
            <Link
              href="/orders"
              className="rounded-lg bg-slate-700 px-5 py-2.5 font-medium text-white shadow hover:bg-slate-800"
            >
              Order History
            </Link>
            <Link
              href="/priority-queue"
              className="rounded-lg bg-amber-600 px-5 py-2.5 font-medium text-white shadow hover:bg-amber-700"
            >
              Late Delivery Priority Queue
            </Link>
          </div>
        )}

        <p className="mt-6 text-sm text-slate-600">
          <Link href="/priority-queue" className="font-medium text-blue-700 underline hover:text-blue-800">
            Priority Queue
          </Link>{" "}
          shows the top 50 orders by late delivery probability. It does not require a customer selection.
        </p>
      </div>
    </div>
  );
}
