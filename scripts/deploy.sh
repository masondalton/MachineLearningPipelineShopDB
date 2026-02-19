#!/bin/bash
# Deploy ML Pipeline to AWS: SAM build + deploy, seed data bucket, build + upload static app

set -e
cd "$(dirname "$0")/.."

echo "=== 1. SAM build ==="
sam build

echo "=== 2. SAM deploy (guided first time) ==="
sam deploy --no-confirm-changeset

echo "=== 3. Seed data bucket (shop.db, artifacts) ==="
STACK_NAME=$(grep 'stack_name' samconfig.toml 2>/dev/null | cut -d'"' -f2 || echo "ml-pipeline")
DATA_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='DataBucketName'].OutputValue" --output text 2>/dev/null || true)
if [ -z "$DATA_BUCKET" ]; then
  echo "Run: aws cloudformation describe-stacks --stack-name YOUR_STACK --query 'Stacks[0].Outputs'"
  echo "Get DataBucketName, then: aws s3 cp data/shop.db s3://BUCKET/shop.db"
  echo "      aws s3 cp artifacts/ s3://BUCKET/artifacts/ --recursive"
else
  aws s3 cp data/shop.db "s3://${DATA_BUCKET}/shop.db" 2>/dev/null || echo "No data/shop.db to upload"
  aws s3 cp artifacts/ "s3://${DATA_BUCKET}/artifacts/" --recursive 2>/dev/null || echo "No artifacts to upload"
fi

echo "=== 4. Build static app (with API URL from SAM outputs) ==="
STACK_NAME=$(grep 'stack_name' samconfig.toml 2>/dev/null | cut -d'"' -f2 || echo "ml-pipeline")
API_BASE=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" --output text 2>/dev/null || true)
if [ -z "$API_BASE" ]; then
  echo "WARNING: Could not get ApiBaseUrl from stack $STACK_NAME. Build will have empty API base."
  echo "Run: aws cloudformation describe-stacks --stack-name $STACK_NAME --query 'Stacks[0].Outputs'"
fi
cd app
echo "Building with NEXT_PUBLIC_API_BASE_URL=$API_BASE"
NEXT_PUBLIC_API_BASE_URL="${API_BASE}" npm run build

echo "=== 5. Upload static app to S3 ==="
STATIC_BUCKET=$(aws cloudformation describe-stacks --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='StaticBucketName'].OutputValue" --output text 2>/dev/null || true)
if [ -n "$STATIC_BUCKET" ]; then
  aws s3 sync out/ "s3://${STATIC_BUCKET}/" --delete
  echo "Static site: http://${STATIC_BUCKET}.s3-website-${AWS_REGION:-us-east-1}.amazonaws.com"
else
  echo "Upload app/out/ to StaticBucketName from CloudFormation outputs"
fi

echo "=== Done ==="
