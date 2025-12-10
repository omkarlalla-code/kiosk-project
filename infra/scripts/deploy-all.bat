@echo off
REM Deploy all services to Google Cloud Run
REM Usage: deploy-all.bat [PROJECT_ID] [REGION]

setlocal

set PROJECT_ID=%1
if "%PROJECT_ID%"=="" set PROJECT_ID=your-project-id

set REGION=%2
if "%REGION%"=="" set REGION=us-central1

echo Deploying all services to project: %PROJECT_ID% in region: %REGION%

REM Set project
gcloud config set project %PROJECT_ID%

REM Deploy orchestrator
echo Deploying orchestrator...
cd ..\..\services\orchestrator
gcloud run deploy orchestrator --source . --region %REGION% --allow-unauthenticated --set-secrets LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest --memory 512Mi --timeout 60s

REM Deploy image-screener
echo Deploying image-screener...
cd ..\image-screener
gcloud run deploy image-screener --source . --region %REGION% --allow-unauthenticated --memory 1Gi --timeout 30s

REM Deploy payment-backend
echo Deploying payment-backend...
cd ..\payment-backend
gcloud run deploy payment-backend --source . --region %REGION% --allow-unauthenticated --set-secrets RAZORPAY_KEY_ID=razorpay-key:latest,RAZORPAY_KEY_SECRET=razorpay-secret:latest,PAYMENT_SIGN_SECRET=payment-sign-secret:latest --memory 512Mi --timeout 30s

echo All services deployed successfully!

REM Get service URLs
echo.
echo Service URLs:
gcloud run services list --region %REGION% --format="table(name,url)"

cd ..\..\infra\scripts

endlocal
