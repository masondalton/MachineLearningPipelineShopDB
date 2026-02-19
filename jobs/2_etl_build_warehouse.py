"""
ETL Job: Build denormalized modeling table in warehouse.db.
Reads from shop.db, writes to warehouse.db → fact_orders_ml.
"""
import pandas as pd

from config import OP_DB_PATH, WH_DB_PATH, FEATURE_COLS, LABEL_COL
from utils_db import sqlite_conn
from features import (
    build_order_item_aggregates,
    add_customer_age,
    add_customer_order_count,
    add_order_datetime_features,
)


def build_modeling_table() -> int:
    """
    Extract, transform, load. Returns row count of fact_orders_ml.
    """
    with sqlite_conn(OP_DB_PATH) as conn:
        # 1. Order-level aggregates (quantity-weighted avg_product_cost)
        order_item_features = build_order_item_aggregates(conn)

        # 2. Full orders count for customer_order_count (ALL orders, not just shipped)
        order_counts = pd.read_sql(
            "SELECT customer_id, COUNT(*) as cnt FROM orders GROUP BY customer_id",
            conn,
        )
        order_counts_series = order_counts.set_index("customer_id")["cnt"]

        # 3. Load shipped orders with label (INNER JOIN shipments)
        orders_shipments = pd.read_sql(
            """
            SELECT
                o.order_id,
                o.customer_id,
                o.order_datetime,
                o.shipping_fee,
                s.ship_datetime,
                s.late_delivery,
                c.birthdate
            FROM orders o
            INNER JOIN shipments s ON o.order_id = s.order_id
            JOIN customers c ON o.customer_id = c.customer_id
            """,
            conn,
        )

    # 4. Merge aggregates onto shipped orders
    df = orders_shipments.merge(order_item_features, on="order_id", how="left")

    # 5. Parse dates with coercion
    df["order_datetime"] = pd.to_datetime(df["order_datetime"], errors="coerce")
    df["ship_datetime"] = pd.to_datetime(df["ship_datetime"], errors="coerce")
    df["birthdate"] = pd.to_datetime(df["birthdate"], errors="coerce")

    # 6. Drop rows with invalid dates
    df = df.dropna(subset=["order_datetime", "birthdate", "ship_datetime"])

    # 7. Add order datetime features (order_dow, order_month, order_hour)
    df = add_order_datetime_features(df)

    # 8. Add customer_age (shared; invalid ages set to NA)
    df = add_customer_age(df)

    # 9. customer_order_count from FULL orders table (same definition as inference)
    df = add_customer_order_count(df, order_counts_series)

    # 10. Coerce numeric columns
    for col in [
        "num_items",
        "total_value",
        "avg_product_cost",
        "num_distinct_products",
        "order_dow",
        "order_month",
        "order_hour",
        "shipping_fee",
    ]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # 11. Build output columns
    output_cols = ["order_id", "customer_id"] + FEATURE_COLS + [LABEL_COL]
    df_out = df[output_cols].copy()

    # 12. Drop rows with missing critical features
    df_out = df_out.dropna(subset=FEATURE_COLS + [LABEL_COL])

    # 13. Ensure label is int 0/1
    df_out[LABEL_COL] = df_out[LABEL_COL].astype(int)

    # 14. Write to warehouse
    WH_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite_conn(WH_DB_PATH) as wh_conn:
        df_out.to_sql("fact_orders_ml", wh_conn, if_exists="replace", index=False)

    return len(df_out)


if __name__ == "__main__":
    row_count = build_modeling_table()
    print(f"Warehouse updated. fact_orders_ml rows: {row_count}")
