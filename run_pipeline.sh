#!/bin/bash
# Run the full pipeline: validate -> ETL -> train -> inference
# Use for manual runs or schedule via cron at 1 AM daily.

cd "$(dirname "$0")"
mkdir -p logs
python3 jobs/run_scheduled_pipeline.py >> logs/pipeline.log 2>&1
