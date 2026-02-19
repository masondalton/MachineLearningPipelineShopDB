"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageInstructions } from "@/components/PageInstructions";
import { apiUrl } from "@/lib/api";

interface PriorityRow {
  order_id: number;
  late_delivery_probability: number;
  predicted_late_delivery: number;
  prediction_timestamp: string | null;
  customer_id: number;
  order_datetime: string;
  order_total: number;
  full_name: string;
}

export default function PriorityQueuePage() {
  const [rows, setRows] = useState<PriorityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);

  const fetchQueue = () => {
    setLoading(true);
    fetch(apiUrl("/priority-queue"))
      .then((r) => r.json())
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const handleRunScoring = async () => {
    setScoring(true);
    try {
      const res = await fetch(apiUrl("/run-scoring"), { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      fetchQueue();
    } catch (e) {
      console.error(e);
      alert("Scoring failed");
    } finally {
      setScoring(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-6 text-2xl font-bold text-slate-800">
          Late Delivery Priority Queue
        </h1>

        <PageInstructions
          title="What this page does"
          description="This is the warehouse Late Delivery Priority Queue. It shows the top 50 orders ranked by late delivery probability (highest risk first). Predictions come from the ML model—the app does not run ML directly; it reads predictions written to the database by the inference job."
          steps={[
            "Run Scoring: Triggers the inference job (Python script) that loads the trained model, scores unfulfilled orders, and writes predictions to order_predictions in shop.db",
            "The table refreshes after scoring completes so you see the updated priority list",
            "Unfulfilled orders = orders without a shipment. Place new orders to create unfulfilled orders for scoring",
            "No customer selection is required—this page shows all scored orders across customers",
          ]}
        />

        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="text-blue-700 underline hover:text-blue-800"
          >
            Customer Dashboard
          </Link>
          <button
            onClick={handleRunScoring}
            disabled={scoring}
            className="rounded-lg bg-amber-600 px-5 py-2.5 font-medium text-white shadow hover:bg-amber-700 disabled:opacity-50"
            title="Runs the inference job to score unfulfilled orders and write predictions to the database"
          >
            {scoring ? "Running scoring..." : "Run Scoring"}
          </button>
          <span className="text-sm text-slate-600">
            Run Scoring triggers the inference job and refreshes the table below.
          </span>
        </div>

        {loading ? (
          <p className="text-slate-600">Loading...</p>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
            <p className="font-medium text-slate-700">No predictions yet.</p>
            <p className="mt-2">
              Place new orders (they will be unfulfilled) and click Run Scoring to generate predictions.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100">
                  <th className="p-3 text-left font-semibold text-slate-800">Rank</th>
                  <th className="p-3 text-left font-semibold text-slate-800">Order ID</th>
                  <th className="p-3 text-left font-semibold text-slate-800">Customer</th>
                  <th className="p-3 text-left font-semibold text-slate-800">Order Date</th>
                  <th className="p-3 text-right font-semibold text-slate-800">Total</th>
                  <th className="p-3 text-right font-semibold text-slate-800">Late Prob</th>
                  <th className="p-3 text-center font-semibold text-slate-800">Predicted Late</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.order_id} className="border-b border-slate-100 last:border-0">
                    <td className="p-3 text-slate-700">{i + 1}</td>
                    <td className="p-3 text-slate-700">{r.order_id}</td>
                    <td className="p-3 text-slate-700">{r.full_name}</td>
                    <td className="p-3 text-slate-700">
                      {new Date(r.order_datetime).toLocaleString()}
                    </td>
                    <td className="p-3 text-right text-slate-700">
                      ${r.order_total.toFixed(2)}
                    </td>
                    <td className="p-3 text-right font-medium text-slate-800">
                      {(r.late_delivery_probability * 100).toFixed(1)}%
                    </td>
                    <td className="p-3 text-center text-slate-700">
                      {r.predicted_late_delivery ? "Yes" : "No"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
