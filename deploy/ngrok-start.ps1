# KASOFT — démarrage rapide pour démo client (ngrok)
# Usage : powershell -ExecutionPolicy Bypass -File deploy\ngrok-start.ps1
#
# Avant la 1ère utilisation :
#   ngrok config add-authtoken VOTRE_TOKEN   (https://dashboard.ngrok.com)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$NgrokUrl = "https://flogging-hurdle-unworried.ngrok-free.dev"
$Port = 5000

if (Test-Path ".env") {
    $line = Get-Content ".env" | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
    if ($line -match '=\s*(\d+)') { $Port = [int]$Matches[1] }
}

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Host "Installation de ngrok..." -ForegroundColor Yellow
    winget install ngrok.ngrok --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
    Write-Host "ERREUR : ngrok introuvable." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path ".env") -and (Test-Path ".env.example")) {
    Copy-Item ".env.example" ".env"
}

# Arrêter anciennes instances (évite ERR_NGROK_3004)
Stop-Process -Name ngrok -Force -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue 2>$null |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

$python = if (Test-Path ".venv\Scripts\python.exe") { ".\.venv\Scripts\python.exe" } else { "python" }

Write-Host ""
Write-Host "=== KASOFT — démo client (ngrok) ===" -ForegroundColor Cyan
Write-Host "URL client : ${NgrokUrl}/login" -ForegroundColor Green
Write-Host "PIN        : 2026" -ForegroundColor Green
Write-Host ""
Write-Host "Gardez cette fenetre OUVERTE pendant la demo." -ForegroundColor Yellow
Write-Host ""

$flaskProc = Start-Process -FilePath $python -ArgumentList "app.py" -WorkingDirectory $Root -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 4

try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 15
    Write-Host "Flask OK" -ForegroundColor Green
} catch {
    Write-Host "Flask ne repond pas sur le port $Port" -ForegroundColor Red
    exit 1
}

Write-Host "Demarrage ngrok... (Ctrl+C pour arreter)" -ForegroundColor Cyan
Write-Host ""

try {
    ngrok http $Port --url=$NgrokUrl
} finally {
    if ($flaskProc -and -not $flaskProc.HasExited) {
        Stop-Process -Id $flaskProc.Id -Force -ErrorAction SilentlyContinue
    }
}
