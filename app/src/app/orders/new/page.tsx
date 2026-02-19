"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCustomer } from "@/contexts/CustomerContext";
import { PageInstructions } from "@/components/PageInstructions";
import { apiUrl } from "@/lib/api";

interface Product {
  product_id: number;
  sku: string;
  product_name: string;
  category: string;
  price: number;
}

interface LineItem {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
}

export default function PlaceOrderPage() {
  const { customer } = useCustomer();
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/products"))
      .then((r) => r.json())
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const addItem = (p: Product, qty: number) => {
    if (qty <= 0) return;
    setLineItems((prev) => {
      const existing = prev.find((i) => i.productId === p.product_id);
      if (existing) {
        return prev.map((i) =>
          i.productId === p.product_id
            ? { ...i, quantity: i.quantity + qty }
            : i
        );
      }
      return [
        ...prev,
        {
          productId: p.product_id,
          productName: p.product_name,
          price: p.price,
          quantity: qty,
        },
      ];
    });
  };

  const removeItem = (productId: number) => {
    setLineItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const subtotal = lineItems.reduce(
    (s, i) => s + i.price * i.quantity,
    0
  );
  const shippingFee = subtotal > 100 ? 0 : 9.99;
  const taxAmount = Math.round(subtotal * 0.08 * 100) / 100;
  const total = Math.round((subtotal + shippingFee + taxAmount) * 100) / 100;

  const handleSubmit = async () => {
    if (!customer || lineItems.length === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.customer_id,
          items: lineItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.price,
          })),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/orders");
    } catch (e) {
      console.error(e);
      alert("Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

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
        <h1 className="mb-6 text-2xl font-bold text-slate-800">Place Order</h1>

        <PageInstructions
          title="What this page does"
          description="Place a new order as the selected customer. The order and line items are saved to the operational database (shop.db). New orders have no shipment yet—they are unfulfilled, which makes them eligible for late-delivery predictions when you run scoring."
          steps={[
            "Add products to your cart using the quantity field and Add button",
            "Remove items from the cart with the Remove button if needed",
            "Click Place Order to save the order to shop.db (orders + order_items tables)",
            "Orders over $100 get free shipping",
          ]}
        />

        <p className="mb-4 text-slate-700">
          Ordering as <strong className="text-slate-800">{customer.full_name}</strong>
        </p>
        <Link href="/" className="text-blue-700 underline hover:text-blue-800">
          Back to Customer Dashboard
        </Link>

        {loading ? (
          <p className="mt-4 text-slate-600">Loading products...</p>
        ) : (
          <>
            <div className="mt-6 space-y-2">
              <h2 className="font-semibold text-slate-800">Add products</h2>
              {products.map((p) => (
                <div
                  key={p.product_id}
                  className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex-1">
                    <span className="font-medium text-slate-800">{p.product_name}</span>
                    <span className="ml-2 text-slate-600">
                      ${p.price.toFixed(2)} • {p.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      defaultValue={1}
                      id={`qty-${p.product_id}`}
                      className="w-20 rounded border border-slate-300 px-3 py-2 text-slate-800"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById(
                          `qty-${p.product_id}`
                        ) as HTMLInputElement;
                        addItem(p, parseInt(input?.value || "1", 10));
                      }}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {lineItems.length > 0 && (
              <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 font-semibold text-slate-800">Cart</h2>
                {lineItems.map((i) => (
                  <div
                    key={i.productId}
                    className="flex justify-between py-2 text-slate-700"
                  >
                    <span>
                      {i.productName} x {i.quantity}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        ${(i.price * i.quantity).toFixed(2)}
                      </span>
                      <button
                        onClick={() => removeItem(i.productId)}
                        className="text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
                <hr className="my-4 border-slate-200" />
                <div className="space-y-1 text-sm text-slate-700">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>${subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Shipping</span>
                    <span>${shippingFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <span>${taxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Click Place Order to save this order to shop.db. It will appear as unfulfilled until a shipment is added.
                </p>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="mt-4 w-full rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? "Placing order..." : "Place Order"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
