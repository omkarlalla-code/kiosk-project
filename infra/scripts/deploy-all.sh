#!/bin/bash

# Deploy all services to Google Cloud Run
# Usage: ./deploy-all.sh [PROJECT_ID] [REGION]

set -e

PROJECT_ID=${1:-"your-project-id"}
REGION=${2:-"us-central1"}

echo "Deploying all services to project: $PROJECT_ID in region: $REGION"

# Set project
gcloud config set project $PROJECT_ID

# Deploy orchestrator
echo "Deploying orchestrator..."
cd ../../services/orchestrator
gcloud run deploy orchestrator \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --set-secrets LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest \
  --memory 512Mi \
  --timeout 60s

# Deploy image-screener
echo "Deploying image-screener..."
cd ../image-screener
gcloud run deploy image-screener \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 30s

# Deploy payment-backend
echo "Deploying payment-backend..."
cd ../payment-backend
gcloud run deploy payment-backend \
  --source . \
  --region $REGION \
  --allow-unauthenticated \
  --set-secrets RAZORPAY_KEY_ID=razorpay-key:latest,RAZORPAY_KEY_SECRET=razorpay-secret:latest,PAYMENT_SIGN_SECRET=payment-sign-secret:latest \
  --memory 512Mi \
  --timeout 30s

echo "All services deployed successfully!"

# Get service URLs
echo ""
echo "Service URLs:"
gcloud run services list --region $REGION --format="table(name,url)"

cd ../../infra/scripts
