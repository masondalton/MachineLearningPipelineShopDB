"""
Shared configuration for all pipeline jobs.
All jobs agree on paths and filenames.
Override via LAMBDA_DATA_DIR / LAMBDA_ARTIFACTS_DIR when running in Lambda.
"""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

_data_dir = os.environ.get("LAMBDA_DATA_DIR")
_artifacts_dir = os.environ.get("LAMBDA_ARTIFACTS_DIR")
DATA_DIR = Path(_data_dir) if _data_dir else (PROJECT_ROOT / "data")
ARTIFACTS_DIR = Path(_artifacts_dir) if _artifacts_dir else (PROJECT_ROOT / "artifacts")

OP_DB_PATH = DATA_DIR / "shop.db"
WH_DB_PATH = DATA_DIR / "warehouse.db"

MODEL_PATH = ARTIFACTS_DIR / "late_delivery_model.sav"
MODEL_METADATA_PATH = ARTIFACTS_DIR / "model_metadata.json"
METRICS_PATH = ARTIFACTS_DIR / "metrics.json"

# Feature columns (locked - must match ETL, training, inference)
FEATURE_COLS = [
    "num_items",
    "total_value",
    "avg_product_cost",
    "customer_age",
    "customer_order_count",
    "order_dow",
    "order_month",
    "order_hour",
    "shipping_fee",
    "num_distinct_products",
]

LABEL_COL = "late_delivery"
