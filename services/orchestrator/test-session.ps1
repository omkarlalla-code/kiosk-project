# Test script for Orchestrator session creation
# Usage: .\test-session.ps1

Write-Host "Testing Orchestrator /start_session endpoint..." -ForegroundColor Cyan

$body = @{
    kiosk_id = "kiosk-001"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/start_session" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body

    Write-Host "`nSuccess! Session created:" -ForegroundColor Green
    Write-Host "Session ID: $($response.session_id)" -ForegroundColor Yellow
    Write-Host "Room Name: $($response.room_name)" -ForegroundColor Yellow
    Write-Host "LiveKit URL: $($response.livekit_url)" -ForegroundColor Yellow
    Write-Host "`nToken (first 50 chars): $($response.token.Substring(0, [Math]::Min(50, $response.token.Length)))..." -ForegroundColor Gray

} catch {
    Write-Host "`nError: $_" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
}
