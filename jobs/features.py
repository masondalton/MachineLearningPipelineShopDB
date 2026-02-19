"""
Shared feature engineering logic for ETL and inference.
Both must use the same transformations - import these functions in both.
"""
import pandas as pd


ORDER_ITEM_AGGREGATES_SQL = """
SELECT
    oi.order_id,
    SUM(oi.quantity) AS num_items,
    SUM(oi.quantity * oi.unit_price) AS total_value,
    SUM(p.cost * oi.quantity) / NULLIF(SUM(oi.quantity), 0) AS avg_product_cost,
    COUNT(DISTINCT oi.product_id) AS num_distinct_products
FROM order_items oi
JOIN products p ON oi.product_id = p.product_id
"""


def build_order_item_aggregates(conn, order_ids=None) -> pd.DataFrame:
    """
    Return DataFrame with order_id, num_items, total_value, avg_product_cost.
    avg_product_cost is quantity-weighted: SUM(cost * quantity) / SUM(quantity).
    If order_ids provided, aggregate only those orders (for inference).
    """
    if order_ids is None or len(order_ids) == 0:
        query = ORDER_ITEM_AGGREGATES_SQL + " GROUP BY oi.order_id"
        return pd.read_sql(query, conn)
    placeholders = ",".join("?" * len(order_ids))
    query = (
        ORDER_ITEM_AGGREGATES_SQL
        + f" WHERE oi.order_id IN ({placeholders}) GROUP BY oi.order_id"
    )
    return pd.read_sql(query, conn, params=list(order_ids))


def add_order_datetime_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add order_dow (0-6), order_month (1-12), order_hour (0-23) from order_datetime.
    Expects order_datetime as datetime column.
    """
    df = df.copy()
    df["order_dow"] = df["order_datetime"].dt.dayofweek
    df["order_month"] = df["order_datetime"].dt.month
    df["order_hour"] = df["order_datetime"].dt.hour
    return df


def add_customer_age(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add customer_age = floor((order_datetime - birthdate) / 365 days).
    Invalid ages (< 0 or > 120) set to pd.NA.
    Expects order_datetime and birthdate as datetime columns.
    """
    df = df.copy()
    df["customer_age"] = (df["order_datetime"] - df["birthdate"]).dt.days // 365
    mask_invalid = (df["customer_age"] < 0) | (df["customer_age"] > 120)
    df.loc[mask_invalid, "customer_age"] = pd.NA
    return df


def add_customer_order_count(df: pd.DataFrame, order_counts: pd.Series) -> pd.DataFrame:
    """
    Add customer_order_count from a pre-computed Series mapping customer_id -> count.
    order_counts should be the count of ALL orders per customer (from full orders table).
    """
    df = df.copy()
    df["customer_order_count"] = df["customer_id"].map(order_counts).fillna(0).astype(int)
    return df


def prepare_features_for_model(df: pd.DataFrame, feature_cols: list) -> pd.DataFrame:
    """
    Select feature columns, coerce to numeric. No imputation - pipeline imputer handles NaNs.
    """
    for col in feature_cols:
        if col not in df.columns:
            raise ValueError(f"Missing feature column: {col}")
    X = df[feature_cols].copy()
    for col in feature_cols:
        X[col] = pd.to_numeric(X[col], errors="coerce")
    return X
