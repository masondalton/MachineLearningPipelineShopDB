"""
Training Job: Train model from warehouse, save artifacts.
Loads fact_orders_ml, trains pipeline, saves .sav, metadata, metrics.
Threshold tuned for high recall on late_delivery (class 1) to minimize false negatives.
"""
import json
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    fbeta_score,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from config import (
    WH_DB_PATH,
    ARTIFACTS_DIR,
    MODEL_PATH,
    MODEL_METADATA_PATH,
    METRICS_PATH,
    FEATURE_COLS,
    LABEL_COL,
)
from utils_db import sqlite_conn

MODEL_VERSION = "1.0.0"
TARGET_RECALL_LATE = 0.90  # Target recall for late_delivery (class 1)
MIN_PRECISION = 0.10  # Minimum precision to accept when maximizing recall


def _choose_threshold(y_test, y_prob) -> float:
    """
    Choose threshold that prioritizes recall for late_delivery (class 1).
    First try to reach TARGET_RECALL_LATE; else pick highest recall with precision >= MIN_PRECISION.
    """
    best_threshold = 0.5
    best_recall = 0.0
    best_precision = 0.0

    for t in np.arange(0.10, 0.95, 0.05):
        y_pred = (y_prob >= t).astype(int)
        prec, rec, _, _ = precision_recall_fscore_support(
            y_test, y_pred, labels=[0, 1], zero_division=0
        )
        # prec[1], rec[1] for class 1 (late_delivery)
        rec_late = rec[1] if len(rec) > 1 else 0.0
        prec_late = prec[1] if len(prec) > 1 else 0.0

        if rec_late >= TARGET_RECALL_LATE and prec_late >= MIN_PRECISION:
            return float(t)
        if rec_late > best_recall and prec_late >= MIN_PRECISION:
            best_recall = rec_late
            best_threshold = t
            best_precision = prec_late

    return float(best_threshold)


def train_and_save() -> None:
    """Load warehouse data, train, evaluate, save artifacts."""
    with sqlite_conn(WH_DB_PATH) as conn:
        df = pd.read_sql("SELECT * FROM fact_orders_ml", conn)

    X = df[FEATURE_COLS]
    y = df[LABEL_COL].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )

    pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(max_iter=1000)),
        ]
    )

    pipeline.fit(X_train, y_train)

    y_prob = pipeline.predict_proba(X_test)[:, 1]

    # Choose threshold for high recall on late_delivery (class 1)
    threshold = _choose_threshold(y_test.values, y_prob)

    y_pred_threshold = (y_prob >= threshold).astype(int)

    # Metrics at default threshold (0.5) for reference
    y_pred_default = pipeline.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred_default)
    f1 = f1_score(y_test, y_pred_default)
    roc_auc = roc_auc_score(y_test, y_prob)
    report_default = classification_report(y_test, y_pred_default, output_dict=True)

    # Metrics at chosen threshold
    prec_t, rec_t, _, _ = precision_recall_fscore_support(
        y_test, y_pred_threshold, labels=[0, 1], zero_division=0
    )
    f2_t = fbeta_score(y_test, y_pred_threshold, beta=2, zero_division=0)
    cm_t = confusion_matrix(y_test, y_pred_threshold)

    threshold_metrics = {
        "accuracy_at_threshold": float(accuracy_score(y_test, y_pred_threshold)),
        "precision_class_0": float(prec_t[0]),
        "precision_class_1": float(prec_t[1]),
        "recall_class_0": float(rec_t[0]),
        "recall_class_1": float(rec_t[1]),
        "f1_at_threshold": float(f1_score(y_test, y_pred_threshold)),
        "f2_at_threshold": float(f2_t),
        "confusion_matrix_at_threshold": cm_t.tolist(),
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(pipeline, str(MODEL_PATH))

    metadata = {
        "model_name": "late_delivery_pipeline",
        "model_version": MODEL_VERSION,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "warehouse_table": "fact_orders_ml",
        "num_training_rows": int(X_train.shape[0]),
        "num_test_rows": int(X_test.shape[0]),
        "features": FEATURE_COLS,
        "label": LABEL_COL,
        "classification_threshold": threshold,
    }

    metrics = {
        "accuracy": float(accuracy),
        "f1": float(f1),
        "roc_auc": float(roc_auc),
        "classification_report": report_default,
        "threshold_metrics": threshold_metrics,
        "classification_threshold": threshold,
    }

    with open(MODEL_METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print("Training complete.")
    print(f"Saved model: {MODEL_PATH}")
    print(f"Classification threshold: {threshold} (recall-focused for late_delivery)")
    print(f"Saved metadata: {MODEL_METADATA_PATH}")
    print(f"Saved metrics: {METRICS_PATH}")


if __name__ == "__main__":
    train_and_save()
