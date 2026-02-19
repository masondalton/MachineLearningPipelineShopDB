"""
Orchestrator: Run ETL → train → inference in sequence.
Schedule with OS cron at 1:00 AM daily.
"""
import sys
import os
import importlib.util

# Ensure we can import from jobs when run from project root
_jobs_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _jobs_dir)


def _load_module(name: str, path: str):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_jobs_dir, path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_m1 = _load_module("validate_schema", "1_validate_schema.py")
_m2 = _load_module("etl_build_warehouse", "2_etl_build_warehouse.py")
_m3 = _load_module("train_model", "3_train_model.py")
_m4 = _load_module("run_inference", "4_run_inference.py")

validate_schema = _m1.validate_schema
build_modeling_table = _m2.build_modeling_table
train_and_save = _m3.train_and_save
run_inference = _m4.run_inference


def run_pipeline() -> bool:
    """Run validate → ETL → train → inference. Returns True if all succeed."""
    print("=== Starting scheduled pipeline ===")

    if not validate_schema():
        print("Schema validation failed. Aborting.")
        return False

    print("\n=== ETL ===")
    try:
        n = build_modeling_table()
        print(f"ETL done. Rows: {n}")
    except Exception as e:
        print(f"ETL failed: {e}")
        return False

    print("\n=== Training ===")
    try:
        train_and_save()
    except Exception as e:
        print(f"Training failed: {e}")
        return False

    print("\n=== Inference ===")
    try:
        n = run_inference()
        print(f"Inference done. Predictions: {n}")
    except Exception as e:
        print(f"Inference failed: {e}")
        return False

    print("\n=== Pipeline complete ===")
    return True


if __name__ == "__main__":
    ok = run_pipeline()
    sys.exit(0 if ok else 1)
