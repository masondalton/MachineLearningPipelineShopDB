# ML Pipeline Deployment

Complete ML pipeline for late delivery prediction: ETL, training, inference, and a Next.js app for testing.

## Quick Start

### 1. Python environment

```bash
pip install -r requirements.txt
```

### 2. Run pipeline once (creates warehouse, trains model, runs inference)

```bash
python3 jobs/run_scheduled_pipeline.py
```

Or from the app directory:

```bash
cd app && npm run setup
```

### 3. Start the Next.js app

```bash
cd app && npm install && npm run dev
```

Open http://localhost:3000

## Project Structure

- `data/shop.db` — Operational database
- `data/warehouse.db` — Analytical warehouse (fact_orders_ml)
- `artifacts/` — Model (.sav), metadata, metrics
- `jobs/` — Python pipeline scripts
- `app/` — Next.js application

## Scheduling (Cron)

To run the pipeline daily at 1:00 AM:

### Mac/Linux

```bash
crontab -e
```

Add:

```
0 1 * * * cd /path/to/Dalton_Mason_ML_Pipeline_Deployment && /path/to/venv/bin/python jobs/run_scheduled_pipeline.py >> logs/pipeline.log 2>&1
```

Replace:
- `/path/to/Dalton_Mason_ML_Pipeline_Deployment` with the actual project path
- `/path/to/venv/bin/python` with your Python executable (or `python3` if in PATH)

### Create logs directory

```bash
mkdir -p logs
```

## S3 + Lambda Deployment

For cloud deployment (S3 static site, API Gateway, Lambda, EventBridge scheduler):

1. See [DEPLOY.md](DEPLOY.md) for full instructions
2. Run `sam build && sam deploy --guided`
3. Seed the data bucket with `shop.db` and `artifacts/`
4. Build the static app with `NEXT_PUBLIC_API_BASE_URL=<ApiBaseUrl>` and upload to the static bucket

The pipeline runs automatically at **1:00 AM UTC daily** via EventBridge.

## Local Development (with API)

For local dev, the app needs an API to serve customers, orders, and run scoring. **Use the local dev API server**:

1. In `app/`, create `.env.local` with:
   ```
   NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
   ```
   (See `app/.env.local.example`.)

2. Run both the API server and Next.js:
   ```bash
   cd app
   npm run dev:all
   ```
   Or run in two terminals:
   - Terminal 1: `cd app && npm run dev:api`
   - Terminal 2: `cd app && npm run dev`

3. Open http://localhost:3000 — customers, place order, and run scoring will work.

**Build mode (S3 deployment)**: The static app fetches from the API Gateway URL. No local API needed.

## App Features

1. **Select Customer** — Choose a customer for testing (no auth)
2. **Place Order** — Add products, quantities; order is saved to shop.db (no shipment yet = unfulfilled)
3. **Order History** — View orders for selected customer
4. **Late Delivery Priority Queue** — Top 50 orders by late delivery probability
5. **Run Scoring** — Triggers inference job, refreshes priority queue
