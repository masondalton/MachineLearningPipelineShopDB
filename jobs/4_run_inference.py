"""
Inference Job: Load saved model, predict on unfulfilled orders, write to shop.db.
Unfulfilled = orders with no shipment row.
"""
import json
from datetime import datetime, timezone

import joblib
import pandas as pd

from config import OP_DB_PATH, MODEL_PATH, MODEL_METADATA_PATH, FEATURE_COLS
from utils_db import sqlite_conn, ensure_predictions_table
from features import (
    build_order_item_aggregates,
    add_customer_age,
    add_customer_order_count,
    add_order_datetime_features,
    prepare_features_for_model,
)


def run_inference() -> int:
    """
    Load model, score unfulfilled orders, write predictions to order_predictions.
    Returns count of predictions written.
    """
    model = joblib.load(str(MODEL_PATH))

    try:
        with open(MODEL_METADATA_PATH, encoding="utf-8") as f:
            metadata = json.load(f)
        threshold = metadata.get("classification_threshold", 0.5)
    except (FileNotFoundError, json.JSONDecodeError):
        threshold = 0.5

    with sqlite_conn(OP_DB_PATH) as conn:
        # 1. Get customer_order_count from FULL orders table
        order_counts = pd.read_sql(
            "SELECT customer_id, COUNT(*) as cnt FROM orders GROUP BY customer_id",
            conn,
        )
        order_counts_series = order_counts.set_index("customer_id")["cnt"]

        # 2. Unfulfilled orders: no shipment row
        unfulfilled = pd.read_sql(
            """
            SELECT o.order_id, o.customer_id, o.order_datetime, o.shipping_fee, c.birthdate
            FROM orders o
            JOIN customers c ON o.customer_id = c.customer_id
            LEFT JOIN shipments s ON o.order_id = s.order_id
            WHERE s.shipment_id IS NULL
            """,
            conn,
        )

        order_ids = unfulfilled["order_id"].tolist()
        if not order_ids:
            ensure_predictions_table(conn)
            print("Inference complete. No unfulfilled orders. Predictions written: 0")
            return 0

        # 3. Order-level aggregates (quantity-weighted avg_product_cost)
        order_features = build_order_item_aggregates(conn, order_ids=order_ids)

    # 4. Merge features onto unfulfilled
    df = unfulfilled.merge(order_features, on="order_id", how="left")

    # 5. Drop rows missing required features
    df = df.dropna(subset=["num_items", "total_value", "avg_product_cost", "num_distinct_products"])

    if df.empty:
        print("Inference complete. No orders with valid features. Predictions written: 0")
        return 0

    # 6. Parse dates
    df["order_datetime"] = pd.to_datetime(df["order_datetime"], errors="coerce")
    df["birthdate"] = pd.to_datetime(df["birthdate"], errors="coerce")
    df = df.dropna(subset=["order_datetime", "birthdate"])

    if df.empty:
        print("Inference complete. No orders with valid dates. Predictions written: 0")
        return 0

    # 7. Add order datetime features (order_dow, order_month, order_hour)
    df = add_order_datetime_features(df)

    # 8. Add customer_age (shared; invalid ages -> NA)
    df = add_customer_age(df)

    # 9. Add customer_order_count from FULL orders
    df = add_customer_order_count(df, order_counts_series)

    # 10. Prepare feature matrix (coerce numeric, no imputation - pipeline handles it)
    X = prepare_features_for_model(df, FEATURE_COLS)

    # 11. Predict: probs from model, binary via saved threshold
    probs = model.predict_proba(X)[:, 1]
    preds = (probs >= threshold).astype(int)

    ts = datetime.now(timezone.utc).isoformat()
    out_rows = [
        (int(oid), float(p), int(yhat), ts)
        for oid, p, yhat in zip(df["order_id"], probs, preds)
    ]

    with sqlite_conn(OP_DB_PATH) as conn:
        ensure_predictions_table(conn)
        cur = conn.cursor()
        cur.executemany(
            """
            INSERT OR REPLACE INTO order_predictions
            (order_id, late_delivery_probability, predicted_late_delivery, prediction_timestamp)
            VALUES (?, ?, ?, ?)
            """,
            out_rows,
        )
        conn.commit()

    print(f"Inference complete. Predictions written: {len(out_rows)}")
    return len(out_rows)


if __name__ == "__main__":
    run_inference()
