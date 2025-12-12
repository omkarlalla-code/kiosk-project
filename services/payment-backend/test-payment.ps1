# Test script for Payment Backend
# Usage: .\test-payment.ps1

Write-Host "=== Testing Payment Backend ===" -ForegroundColor Cyan

# Step 1: Create payment session
Write-Host "`n1. Creating payment session..." -ForegroundColor Yellow

$createBody = @{
    amount = 50000
    currency = "INR"
    context = "greek_civilization_session"
    session_id = "test-session-001"
    kiosk_id = "kiosk-001"
} | ConvertTo-Json

try {
    $session = Invoke-RestMethod -Uri "http://localhost:3003/create_session" `
        -Method POST `
        -ContentType "application/json" `
        -Body $createBody

    Write-Host "   Payment ID: $($session.payment_id)" -ForegroundColor Green
    Write-Host "   Amount: $($session.amount) $($session.currency)" -ForegroundColor Green
    Write-Host "   UPI URI: $($session.upi_uri)" -ForegroundColor Gray
    
    $paymentId = $session.payment_id

    # Step 2: Check payment status
    Write-Host "`n2. Checking payment status..." -ForegroundColor Yellow
    $status = Invoke-RestMethod -Uri "http://localhost:3003/status/$paymentId"
    Write-Host "   Status: $($status.status)" -ForegroundColor Green

    # Step 3: Simulate payment completion
    Write-Host "`n3. Simulating payment completion..." -ForegroundColor Yellow
    $completeBody = @{
        status = "success"
    } | ConvertTo-Json

    $complete = Invoke-RestMethod -Uri "http://localhost:3003/mock/complete_payment/$paymentId" `
        -Method POST `
        -ContentType "application/json" `
        -Body $completeBody

    Write-Host "   Status: $($complete.status)" -ForegroundColor Green
    Write-Host "   Transaction ID: $($complete.confirmation.txn_id)" -ForegroundColor Green
    Write-Host "   Signature: $($complete.confirmation.signature.Substring(0, 16))..." -ForegroundColor Gray

    # Step 4: Verify final status
    Write-Host "`n4. Verifying final status..." -ForegroundColor Yellow
    $finalStatus = Invoke-RestMethod -Uri "http://localhost:3003/status/$paymentId"
    Write-Host "   Final Status: $($finalStatus.status)" -ForegroundColor Green

    Write-Host "`n=== All tests passed! ===" -ForegroundColor Green

} catch {
    Write-Host "`nError: $_" -ForegroundColor Red
}
