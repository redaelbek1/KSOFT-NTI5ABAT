# KASOFT — tunnel Cloudflare (gratuit, sans carte bancaire)
# Usage : clic droit → Exécuter avec PowerShell
#   ou : powershell -ExecutionPolicy Bypass -File deploy\cloudflare-tunnel.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

# ── 1. Vérifier cloudflared ──
$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cf) {
    Write-Host "Installation de cloudflared via winget..." -ForegroundColor Yellow
    winget install Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [System.Environment]::GetEnvironmentVariable("Path", "User")
}

if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "ERREUR : cloudflared introuvable. Redémarrez PowerShell puis relancez ce script." -ForegroundColor Red
    exit 1
}

# ── 2. Vérifier .env ──
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Fichier .env créé depuis .env.example" -ForegroundColor Yellow
    }
}

$Port = 5000
if (Test-Path ".env") {
    $line = Get-Content ".env" | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
    if ($line -match '=\s*(\d+)') { $Port = [int]$Matches[1] }
}

# ── 3. Python / venv ──
$python = "python"
if (Test-Path ".venv\Scripts\python.exe") {
    $python = ".\.venv\Scripts\python.exe"
}

Write-Host ""
Write-Host "=== KASOFT + Cloudflare Tunnel ===" -ForegroundColor Cyan
Write-Host "Port local : $Port"
Write-Host ""
Write-Host "IMPORTANT :" -ForegroundColor Yellow
Write-Host "  - Gardez cette fenêtre OUVERTE pendant la démo client"
Write-Host "  - Désactivez la mise en veille du PC (Paramètres > Alimentation)"
Write-Host "  - L'URL https://... change à chaque redémarrage du tunnel"
Write-Host ""

# ── 4. Démarrer Flask en arrière-plan ──
$flaskJob = Start-Job -ScriptBlock {
    param($py, $dir)
    Set-Location $dir
    & $py app.py 2>&1
} -ArgumentList (Resolve-Path $python).Path, $Root

Start-Sleep -Seconds 3

# Vérifier que Flask répond
try {
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "Flask OK sur http://127.0.0.1:$Port" -ForegroundColor Green
} catch {
    Write-Host "Flask démarre encore... (si erreur persiste, lancez 'python app.py' dans un autre terminal)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Démarrage du tunnel Cloudflare..." -ForegroundColor Cyan
Write-Host "Copiez l'URL https://....trycloudflare.com affichée ci-dessous" -ForegroundColor Green
Write-Host ""

# ── 5. Tunnel (bloquant — garde la fenêtre ouverte) ──
try {
    cloudflared tunnel --url "http://127.0.0.1:$Port"
} finally {
    Stop-Job $flaskJob -ErrorAction SilentlyContinue
    Remove-Job $flaskJob -Force -ErrorAction SilentlyContinue
}
