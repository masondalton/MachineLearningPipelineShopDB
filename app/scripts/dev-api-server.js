#!/usr/bin/env node
/**
 * Local dev API server. Run alongside `next dev` for testing customers and orders.
 * Reads from data/shop.db, spawns inference for run-scoring.
 * Set NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 in app/.env.local
 */
const Database = require("better-sqlite3");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const PORT = process.env.DEV_API_PORT || 3001;
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DB_PATH = path.join(PROJECT_ROOT, "data", "shop.db");

function corsHeaders(req) {
  const origin = req.headers.origin || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function send(res, status, data, headers = {}) {
  const h = { "Content-Type": "application/json", ...headers };
  res.writeHead(status, h);
  res.end(typeof data === "string" ? data : JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const pathname = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, { ...corsHeaders(req), "Content-Length": "0" });
    res.end();
    return;
  }

  const headers = corsHeaders(req);

  if (!pathname.startsWith("/api/")) {
    send(res, 404, { error: "Not found" }, headers);
    return;
  }

  const pathPart = pathname.replace(/^\/api\/?/, "") || "/";
  const pathSeg = pathPart.startsWith("/") ? pathPart : `/${pathPart}`;

  try {
    const db = new Database(DB_PATH, { readonly: false });
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");

    if (pathSeg === "/customers" && method === "GET") {
      const rows = db.prepare(
        `SELECT customer_id, full_name, email, city, state FROM customers WHERE is_active = 1 ORDER BY full_name`
      ).all();
      db.close();
      send(res, 200, rows, headers);
      return;
    }

    if (pathSeg === "/products" && method === "GET") {
      const rows = db.prepare(
        `SELECT product_id, sku, product_name, category, price FROM products WHERE is_active = 1 ORDER BY product_name`
      ).all();
      db.close();
      send(res, 200, rows, headers);
      return;
    }

    if (pathSeg === "/orders") {
      if (method === "GET") {
        const customerId = url.searchParams.get("customerId");
        if (!customerId) {
          db.close();
          send(res, 400, { error: "customerId required" }, headers);
          return;
        }
        const rows = db.prepare(
          `SELECT o.order_id, o.order_datetime, o.order_total, o.order_subtotal
           FROM orders o WHERE o.customer_id = ? ORDER BY o.order_datetime DESC`
        ).all(parseInt(customerId, 10));
        db.close();
        send(res, 200, rows, headers);
        return;
      }
      if (method === "POST") {
        let body = "";
        for await (const chunk of req) body += chunk;
        const { customerId, items } = JSON.parse(body || "{}");
        if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
          db.close();
          send(res, 400, { error: "customerId and items (array) required" }, headers);
          return;
        }
        let orderSubtotal = 0;
        for (const it of items) orderSubtotal += it.quantity * it.unitPrice;
        const shippingFee = orderSubtotal > 100 ? 0 : 9.99;
        const taxAmount = Math.round(orderSubtotal * 0.08 * 100) / 100;
        const orderTotal = Math.round((orderSubtotal + shippingFee + taxAmount) * 100) / 100;
        const orderDatetime = new Date().toISOString().slice(0, 19).replace("T", " ");

        const insertOrder = db.prepare(`
          INSERT INTO orders (customer_id, order_datetime, payment_method, device_type, ip_country,
            promo_used, order_subtotal, shipping_fee, tax_amount, order_total, risk_score, is_fraud)
          VALUES (?, ?, 'card', 'desktop', 'US', 0, ?, ?, ?, ?, 0, 0)
        `);
        const insertItem = db.prepare(`
          INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?)
        `);

        const tx = db.transaction(() => {
          const result = insertOrder.run(
            customerId, orderDatetime, orderSubtotal, shippingFee, taxAmount, orderTotal
          );
          const orderId = result.lastInsertRowid;
          for (const it of items) {
            const lineTotal = it.quantity * it.unitPrice;
            insertItem.run(orderId, it.productId, it.quantity, it.unitPrice, lineTotal);
          }
          return orderId;
        });
        const orderId = tx();
        db.close();
        send(res, 200, { orderId, success: true }, headers);
        return;
      }
    }

    if (pathSeg === "/priority-queue" && method === "GET") {
      db.exec(`
        CREATE TABLE IF NOT EXISTS order_predictions (
          order_id INTEGER PRIMARY KEY,
          late_delivery_probability REAL,
          predicted_late_delivery INTEGER,
          prediction_timestamp TEXT
        )
      `);
      const rows = db.prepare(`
        SELECT p.order_id, p.late_delivery_probability, p.predicted_late_delivery,
               p.prediction_timestamp, o.customer_id, o.order_datetime, o.order_total,
               c.full_name
        FROM order_predictions p
        JOIN orders o ON p.order_id = o.order_id
        JOIN customers c ON o.customer_id = c.customer_id
        ORDER BY p.late_delivery_probability DESC
        LIMIT 50
      `).all();
      db.close();
      send(res, 200, rows, headers);
      return;
    }

    if (pathSeg === "/run-scoring" && method === "POST") {
      db.close();
      const scriptPath = path.join(PROJECT_ROOT, "jobs", "4_run_inference.py");
      const result = await new Promise((resolve) => {
        const proc = spawn("python3", [scriptPath], {
          cwd: PROJECT_ROOT,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "", stderr = "";
        proc.stdout?.on("data", (d) => (stdout += d.toString()));
        proc.stderr?.on("data", (d) => (stderr += d.toString()));
        proc.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
      });
      if (result.code !== 0) {
        send(res, 500, { error: "Scoring job failed", stderr: result.stderr }, headers);
        return;
      }
      send(res, 200, { success: true, stdout: result.stdout }, headers);
      return;
    }

    db.close();
    send(res, 404, { error: "Not found" }, headers);
  } catch (err) {
    console.error("Dev API error:", err);
    send(res, 500, { error: err.message || "Internal server error" }, headers);
  }
});

server.listen(PORT, () => {
  console.log(`Dev API server: http://localhost:${PORT}`);
  console.log(`Shop DB: ${DB_PATH}`);
  console.log("Set NEXT_PUBLIC_API_BASE_URL=http://localhost:3001 in .env.local");
});
