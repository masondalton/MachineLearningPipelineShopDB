"""
Pipeline Lambda: Syncs data/artifacts from S3, runs full pipeline or inference-only, uploads back.
Event: {} for full pipeline, {"mode": "inference_only"} for Run Scoring.
"""
import os
import sys
import json
import io
from pathlib import Path

import boto3

# Lambda /tmp paths
TMP_BASE = Path("/tmp")
TMP_DATA = TMP_BASE / "data"
TMP_ARTIFACTS = TMP_BASE / "artifacts"

BUCKET = os.environ.get("DATA_BUCKET")
JOBS_DIR = Path(__file__).resolve().parent / "jobs"

# Add jobs dir so config, utils_db, features, etc. can be imported
sys.path.insert(0, str(JOBS_DIR))


def download_s3(key: str, dest: Path) -> None:
    s3 = boto3.client("s3")
    s3.download_file(BUCKET, key, str(dest))


def upload_s3(local: Path, key: str) -> None:
    s3 = boto3.client("s3")
    s3.upload_file(str(local), BUCKET, key)


def sync_from_s3() -> None:
    from botocore.exceptions import ClientError

    client = boto3.client("s3")
    TMP_DATA.mkdir(parents=True, exist_ok=True)
    TMP_ARTIFACTS.mkdir(parents=True, exist_ok=True)

    for key in ("shop.db", "warehouse.db"):
        try:
            download_s3(key, TMP_DATA / key)
        except ClientError as e:
            if e.response["Error"]["Code"] != "NoSuchKey":
                raise

    for key in ("late_delivery_model.sav", "model_metadata.json", "metrics.json"):
        try:
            download_s3(f"artifacts/{key}", TMP_ARTIFACTS / key)
        except ClientError as e:
            if e.response["Error"]["Code"] != "NoSuchKey":
                raise


def sync_to_s3() -> None:
    if (TMP_DATA / "shop.db").exists():
        upload_s3(TMP_DATA / "shop.db", "shop.db")
    if (TMP_DATA / "warehouse.db").exists():
        upload_s3(TMP_DATA / "warehouse.db", "warehouse.db")
    for name in ("late_delivery_model.sav", "model_metadata.json", "metrics.json"):
        p = TMP_ARTIFACTS / name
        if p.exists():
            upload_s3(p, f"artifacts/{name}")


def run_inference_only() -> dict:
    os.environ["LAMBDA_DATA_DIR"] = str(TMP_DATA)
    os.environ["LAMBDA_ARTIFACTS_DIR"] = str(TMP_ARTIFACTS)

    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "run_inference", JOBS_DIR / "4_run_inference.py"
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    n = mod.run_inference()
    return {"predictions": n, "stdout": f"Inference complete. Predictions written: {n}"}


def run_full_pipeline() -> dict:
    os.environ["LAMBDA_DATA_DIR"] = str(TMP_DATA)
    os.environ["LAMBDA_ARTIFACTS_DIR"] = str(TMP_ARTIFACTS)

    # Use importlib to load modules (1_validate_schema etc. - names with digits)
    import importlib.util

    def load(name: str, filename: str):
        spec = importlib.util.spec_from_file_location(name, JOBS_DIR / filename)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    m1 = load("validate_schema", "1_validate_schema.py")
    m2 = load("etl_build_warehouse", "2_etl_build_warehouse.py")
    m3 = load("train_model", "3_train_model.py")
    m4 = load("run_inference", "4_run_inference.py")

    if not m1.validate_schema():
        raise RuntimeError("Schema validation failed")

    n_etl = m2.build_modeling_table()
    m3.train_and_save()
    n_inf = m4.run_inference()

    return {
        "etl_rows": n_etl,
        "predictions": n_inf,
        "stdout": f"ETL rows: {n_etl}, Predictions: {n_inf}",
    }


def handler(event, context):
    if not BUCKET:
        return {"statusCode": 500, "errorMessage": "DATA_BUCKET not configured"}

    mode = (event or {}).get("mode", "full")
    out = {}

    try:
        sync_from_s3()

        if mode == "inference_only":
            result = run_inference_only()
            out["predictions"] = result["predictions"]
            out["stdout"] = result["stdout"]
        else:
            result = run_full_pipeline()
            out.update(result)

        sync_to_s3()
        return out

    except Exception as e:
        return {"errorMessage": str(e), "errorType": type(e).__name__}
