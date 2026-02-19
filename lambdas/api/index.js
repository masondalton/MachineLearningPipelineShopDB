/**
 * API Lambda: Handles /api/* routes. Downloads shop.db from S3, runs queries, uploads on writes.
 * Uses sql.js (pure JS) - no native bindings, works on Lambda without Docker.
 * For /api/run-scoring, invokes the Pipeline Lambda (inference-only variant).
 */
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");
const initSqlJs = require("sql.js");

const BUCKET = process.env.DATA_BUCKET;
const SHOP_DB_KEY = "shop.db";
const LAMBDA_PIPELINE_ARN = process.env.PIPELINE_LAMBDA_ARN;

const s3 = new S3Client({});
const lambda = new LambdaClient({});

function corsHeaders(origin) {
  const allowed = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function streamToBuffer(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function loadDbFromS3() {
  const resp = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: SHOP_DB_KEY })
  );
  const buf = await streamToBuffer(resp.Body);
  return new Uint8Array(buf);
}

async function uploadDbToS3(db) {
  const data = db.export();
  const body = Buffer.from(data);
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: SHOP_DB_KEY,
      Body: body,
      ContentType: "application/x-sqlite3",
    })
  );
}

/** Get rows from prepared statement as array of objects */
function stmtAll(stmt) {
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function getCustomers(db) {
  const stmt = db.prepare(
    `SELECT customer_id, full_name, email, city, state FROM customers WHERE is_active = 1 ORDER BY full_name`
  );
  return stmtAll(stmt);
}

async function getProducts(db) {
  const stmt = db.prepare(
    `SELECT product_id, sku, product_name, category, price FROM products WHERE is_active = 1 ORDER BY product_name`
  );
  return stmtAll(stmt);
}

async function getOrders(db, customerId) {
  const stmt = db.prepare(
    `SELECT o.order_id, o.order_datetime, o.order_total, o.order_subtotal
     FROM orders o WHERE o.customer_id = ? ORDER BY o.order_datetime DESC`
  );
  stmt.bind([customerId]);
  return stmtAll(stmt);
}

async function getPriorityQueue(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS order_predictions (
      order_id INTEGER PRIMARY KEY,
      late_delivery_probability REAL,
      predicted_late_delivery INTEGER,
      prediction_timestamp TEXT
    )
  `);
  const stmt = db.prepare(`
    SELECT p.order_id, p.late_delivery_probability, p.predicted_late_delivery,
           p.prediction_timestamp, o.customer_id, o.order_datetime, o.order_total,
           c.full_name
    FROM order_predictions p
    JOIN orders o ON p.order_id = o.order_id
    JOIN customers c ON o.customer_id = c.customer_id
    ORDER BY p.late_delivery_probability DESC
    LIMIT 50
  `);
  return stmtAll(stmt);
}

async function postOrder(db, customerId, items) {
  let orderSubtotal = 0;
  for (const it of items) {
    orderSubtotal += it.quantity * it.unitPrice;
  }
  const shippingFee = orderSubtotal > 100 ? 0 : 9.99;
  const taxAmount = Math.round(orderSubtotal * 0.08 * 100) / 100;
  const orderTotal = Math.round((orderSubtotal + shippingFee + taxAmount) * 100) / 100;
  const orderDatetime = new Date().toISOString().slice(0, 19).replace("T", " ");

  db.run("BEGIN");
  try {
    db.run(
      `INSERT INTO orders (customer_id, order_datetime, payment_method, device_type, ip_country,
        promo_used, order_subtotal, shipping_fee, tax_amount, order_total, risk_score, is_fraud)
       VALUES (?, ?, 'card', 'desktop', 'US', 0, ?, ?, ?, ?, 0, 0)`,
      [customerId, orderDatetime, orderSubtotal, shippingFee, taxAmount, orderTotal]
    );
    const r = db.exec("SELECT last_insert_rowid() as id");
    const orderId = r[0]?.values?.[0]?.[0] ?? 0;
    for (const it of items) {
      const lineTotal = it.quantity * it.unitPrice;
      db.run(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, it.productId, it.quantity, it.unitPrice, lineTotal]
      );
    }
    db.run("COMMIT");
    return orderId;
  } catch (e) {
    db.run("ROLLBACK");
    throw e;
  }
}

async function invokePipelineInference() {
  if (!LAMBDA_PIPELINE_ARN) {
    throw new Error("PIPELINE_LAMBDA_ARN not configured");
  }
  const resp = await lambda.send(
    new InvokeCommand({
      FunctionName: LAMBDA_PIPELINE_ARN,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify({ mode: "inference_only" }),
    })
  );
  const payload = JSON.parse(Buffer.from(resp.Payload).toString());
  if (payload.errorMessage) {
    throw new Error(payload.errorMessage);
  }
  return payload;
}

function getPath(event) {
  const raw = event.rawPath || event.path || "";
  const proxy = event.pathParameters?.proxy;
  const base = raw.replace(/^\/api\/?/, "") || (proxy ? `/${proxy}` : "") || "/";
  return base.startsWith("/") ? base : `/${base}`;
}

let SQL = null;
async function getSql() {
  if (!SQL) SQL = await initSqlJs();
  return SQL;
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const pathPart = getPath(event);
  const qs = event.queryStringParameters || {};
  const origin = event.headers?.origin || event.headers?.Origin;

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...corsHeaders(origin), "Content-Length": "0" },
      body: "",
    };
  }

  const headers = corsHeaders(origin);

  try {
    if (!BUCKET) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ error: "DATA_BUCKET not configured" }),
      };
    }

    const Sql = await getSql();
    const buf = await loadDbFromS3();
    const db = new Sql.Database(buf);

    let result;

    if (pathPart === "/customers" && method === "GET") {
      result = await getCustomers(db);
    } else if (pathPart === "/products" && method === "GET") {
      result = await getProducts(db);
    } else if (pathPart === "/orders") {
      if (method === "GET") {
        const customerId = qs.customerId;
        if (!customerId) {
          db.close();
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ error: "customerId required" }),
          };
        }
        result = await getOrders(db, parseInt(customerId, 10));
      } else if (method === "POST") {
        const body = JSON.parse(event.body || "{}");
        const { customerId, items } = body;
        if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
          db.close();
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ error: "customerId and items (array) required" }),
          };
        }
        const orderId = await postOrder(db, customerId, items);
        await uploadDbToS3(db);
        db.close();
        return {
          statusCode: 200,
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ orderId, success: true }),
        };
      }
    } else if (pathPart === "/priority-queue" && method === "GET") {
      result = await getPriorityQueue(db);
    } else if (pathPart === "/run-scoring" && method === "POST") {
      db.close();
      const payload = await invokePipelineInference();
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ success: true, stdout: payload.stdout || "" }),
      };
    } else {
      db.close();
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ error: "Not found" }),
      };
    }

    db.close();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("API error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        error: err.message || "Internal server error",
        stderr: err.stderr,
      }),
    };
  }
};
