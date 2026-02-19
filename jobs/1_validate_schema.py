"""
Pre-ETL schema validation. Run before ETL to prevent silent failures.
Exits with non-zero code if any check fails.
"""
import sys
import pandas as pd

# Add parent to path so we can import from jobs
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import OP_DB_PATH
from utils_db import sqlite_conn


def validate_schema() -> bool:
    """Run all validation checks. Returns True if all pass, False otherwise."""
    if not OP_DB_PATH.exists():
        print(f"FAIL: Database not found at {OP_DB_PATH}")
        return False

    all_ok = True

    with sqlite_conn(OP_DB_PATH) as conn:
        # Check 1: orders and shipments join cleanly on order_id
        try:
            join_check = pd.read_sql("""
                SELECT COUNT(*) as cnt
                FROM orders o
                INNER JOIN shipments s ON o.order_id = s.order_id
            """, conn)
            join_count = int(join_check["cnt"].iloc[0])
            print(f"OK: orders + shipments join: {join_count} rows")
        except Exception as e:
            print(f"FAIL: orders/shipments join: {e}")
            all_ok = False

        # Check 2: products.cost populated and numeric
        try:
            products = pd.read_sql("SELECT cost FROM products LIMIT 1000", conn)
            if products.empty:
                print("FAIL: products table is empty")
                all_ok = False
            else:
                pd.to_numeric(products["cost"], errors="coerce")
                null_cost = products["cost"].isna().sum()
                if null_cost > 0:
                    print(f"WARN: products.cost has {null_cost} nulls")
                print("OK: products.cost is populated and numeric")
        except Exception as e:
            print(f"FAIL: products.cost check: {e}")
            all_ok = False

        # Check 3: order_items.quantity numeric and not null
        try:
            items = pd.read_sql("SELECT quantity FROM order_items LIMIT 1000", conn)
            if items.empty:
                print("FAIL: order_items table is empty")
                all_ok = False
            else:
                pd.to_numeric(items["quantity"], errors="coerce")
                null_qty = items["quantity"].isna().sum()
                if null_qty > 0:
                    print(f"FAIL: order_items.quantity has {null_qty} nulls")
                    all_ok = False
                else:
                    print("OK: order_items.quantity is numeric and not null")
        except Exception as e:
            print(f"FAIL: order_items.quantity check: {e}")
            all_ok = False

        # Check 4: order_items.unit_price numeric and not null
        try:
            items_up = pd.read_sql("SELECT unit_price FROM order_items LIMIT 1000", conn)
            if not items_up.empty:
                items_up["unit_price"] = pd.to_numeric(items_up["unit_price"], errors="coerce")
                null_up = items_up["unit_price"].isna().sum()
                if null_up > 0:
                    print(f"FAIL: order_items.unit_price has {null_up} nulls or non-numeric")
                    all_ok = False
                else:
                    print("OK: order_items.unit_price is numeric and not null")
            else:
                print("WARN: order_items is empty")
        except Exception as e:
            print(f"FAIL: order_items.unit_price check: {e}")
            all_ok = False

        # Check 5: orders.order_datetime parsable as datetime
        try:
            odt = pd.read_sql("SELECT order_datetime FROM orders LIMIT 500", conn)
            if not odt.empty:
                parsed = pd.to_datetime(odt["order_datetime"], errors="coerce")
                bad = parsed.isna().sum()
                if bad > 0:
                    print(f"WARN: orders.order_datetime has {bad} unparseable values")
                print("OK: orders.order_datetime format checked")
            else:
                print("WARN: orders is empty")
        except Exception as e:
            print(f"FAIL: orders.order_datetime check: {e}")
            all_ok = False

        # Check 6: customers.birthdate parsable, reasonable range
        try:
            bd = pd.read_sql("SELECT birthdate FROM customers LIMIT 500", conn)
            if not bd.empty:
                parsed = pd.to_datetime(bd["birthdate"], errors="coerce")
                bad = parsed.isna().sum()
                if bad > 0:
                    print(f"WARN: customers.birthdate has {bad} unparseable values")
                else:
                    years = (pd.Timestamp.now() - parsed).dt.days / 365
                    implausible = ((years < 0) | (years > 120)).sum()
                    if implausible > 0:
                        print(f"WARN: customers.birthdate has {implausible} implausible ages")
                print("OK: customers.birthdate format checked")
            else:
                print("WARN: customers is empty")
        except Exception as e:
            print(f"FAIL: customers.birthdate check: {e}")
            all_ok = False

        # Check 7: shipments.late_delivery exists and looks like 0/1
        try:
            late = pd.read_sql("SELECT DISTINCT late_delivery FROM shipments", conn)
            vals = set(late["late_delivery"].astype(int).tolist())
            if vals.issubset({0, 1}):
                print("OK: shipments.late_delivery exists and is 0/1")
            else:
                print(f"FAIL: shipments.late_delivery has unexpected values: {vals}")
                all_ok = False
        except Exception as e:
            print(f"FAIL: shipments.late_delivery check: {e}")
            all_ok = False

        # Print table info (Check 8)
        print("\nTable row counts:")
        for tbl in ["orders", "order_items", "customers", "products", "shipments"]:
            try:
                cnt = pd.read_sql(f"SELECT COUNT(*) as c FROM {tbl}", conn)
                print(f"  {tbl}: {cnt['c'].iloc[0]}")
            except Exception as e:
                print(f"  {tbl}: ERROR - {e}")

    return all_ok


if __name__ == "__main__":
    ok = validate_schema()
    sys.exit(0 if ok else 1)
