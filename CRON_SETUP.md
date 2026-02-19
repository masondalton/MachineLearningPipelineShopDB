# Cron Setup for 1 AM Daily Pipeline Run

The pipeline runs three jobs in sequence: ETL → Train → Inference. Use the orchestrator script.

## 1. Make the script executable (optional)

```bash
chmod +x run_pipeline.sh
```

## 2. Edit crontab

```bash
crontab -e
```

## 3. Add this line (adjust paths)

```cron
0 1 * * * /path/to/Dalton_Mason_ML_Pipeline_Deployment/run_pipeline.sh
```

Or run Python directly:

```cron
0 1 * * * cd /path/to/Dalton_Mason_ML_Pipeline_Deployment && python3 jobs/run_scheduled_pipeline.py >> logs/pipeline.log 2>&1
```

**Replace** `/path/to/Dalton_Mason_ML_Pipeline_Deployment` with your actual project path.

If using a virtual environment:

```cron
0 1 * * * cd /path/to/project && /path/to/venv/bin/python jobs/run_scheduled_pipeline.py >> logs/pipeline.log 2>&1
```

## 4. Ensure logs directory exists

```bash
mkdir -p logs
```

## Cron format

`minute hour day-of-month month day-of-week`

- `0 1 * * *` = 1:00 AM every day
