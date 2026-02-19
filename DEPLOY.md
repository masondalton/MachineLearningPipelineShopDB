# S3 + Lambda Deployment

Deploy the ML pipeline with EventBridge scheduler, API Lambda, and static Next.js on S3.

## Prerequisites

- AWS CLI configured
- Node.js 20+, Python 3.12+, SAM CLI
- `npm install` in `app/`, `pip install -r requirements.txt` in project root (for local runs)

## 1. Build and deploy with SAM

```bash
# Install SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html

sam build
sam deploy --guided   # First time: set stack name, region, confirm
# Subsequent: sam deploy
```

## 2. Seed the data bucket

After first deploy, upload initial data:

```bash
# Get bucket name from CloudFormation outputs
aws s3 cp data/shop.db s3://YOUR_DATA_BUCKET/shop.db
aws s3 cp artifacts/ s3://YOUR_DATA_BUCKET/artifacts/ --recursive
```

## 3. Build and upload static app

The build **must** use `NEXT_PUBLIC_API_BASE_URL` from SAM outputs; otherwise the app will call the wrong API (or same-origin, causing 404s).

**Option A – Use the build script (recommended):**
```bash
./scripts/build-static.sh
# Then upload app/out/ to your static bucket or Terraform-managed location
```

**Option B – Manual:**
```bash
cd app

# Get ApiBaseUrl from CloudFormation outputs, then:
NEXT_PUBLIC_API_BASE_URL=https://YOUR_API_ID.execute-api.YOUR_REGION.amazonaws.com/api npm run build

# Upload to static bucket
aws s3 sync out/ s3://YOUR_STATIC_BUCKET/ --delete
```

If deploying to daltonforge.com/machinelearningpipeline via Terraform, run `./scripts/build-static.sh` first (it fetches ApiBaseUrl from CloudFormation), then copy `app/out/` into the location Terraform expects.

## 4. Enable static bucket website hosting (optional)

For direct S3 website URL:

```bash
aws s3 website s3://YOUR_STATIC_BUCKET/ --index-document index.html --error-document 404.html
```

Then use: `http://YOUR_STATIC_BUCKET.s3-website-YOUR_REGION.amazonaws.com`

For production, put CloudFront in front of the static bucket.

## Scheduler

- **EventBridge** runs the full pipeline (validate → ETL → train → inference) at **1:00 AM UTC daily**
- **Run Scoring** button in the app invokes the Pipeline Lambda with `inference_only` mode

## Outputs

After `sam deploy`, note:

- `StaticBucketName` – upload Next.js `out/` here
- `DataBucketName` – shop.db, warehouse.db, artifacts go here
- `ApiBaseUrl` – set as `NEXT_PUBLIC_API_BASE_URL` when building the static app
