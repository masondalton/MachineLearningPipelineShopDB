"use client";

import Link from "next/link";
import { useCustomer } from "@/contexts/CustomerContext";

export function AppNav() {
  const { customer } = useCustomer();

  return (
    <nav className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-slate-800">
          Shop ML Pipeline
        </Link>
        <div className="flex gap-4">
          <Link
            href="/"
            className="text-slate-700 hover:text-slate-900 hover:underline"
          >
            Customer Dashboard
          </Link>
          {customer && (
            <>
              <Link
                href="/orders/new"
                className="text-slate-700 hover:text-slate-900 hover:underline"
              >
                Place Order
              </Link>
              <Link
                href="/orders"
                className="text-slate-700 hover:text-slate-900 hover:underline"
              >
                Order History
              </Link>
            </>
          )}
          <Link
            href="/priority-queue"
            className="text-slate-700 hover:text-slate-900 hover:underline"
          >
            Priority Queue
          </Link>
        </div>
      </div>
    </nav>
  );
}
