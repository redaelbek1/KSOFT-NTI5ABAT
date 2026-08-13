# Déploie la version mobile /mobile sur Oracle (conteneur kasoft)
# Usage:
#   .\deploy\deploy-mobile.ps1 -KeyPath "C:\T SHIRT\ssh-key-2026-07-08.key"
param(
    [string]$KeyPath = $env:KASOFT_SSH_KEY,
    [string]$Host = "ubuntu@51.170.128.73",
    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

if (-not $KeyPath -or -not (Test-Path $KeyPath)) {
    Write-Error "Clé SSH introuvable. Passe -KeyPath ou définis KASOFT_SSH_KEY."
    exit 1
}

$files = @(
    @{ local = "templates\comptage_mobile.html"; remote = "comptage_mobile.html"; dest = "/app/templates/comptage_mobile.html" },
    @{ local = "templates\comptage.html"; remote = "comptage.html"; dest = "/app/templates/comptage.html" },
    @{ local = "static\comptage-mobile.js"; remote = "comptage-mobile.js"; dest = "/app/static/comptage-mobile.js" },
    @{ local = "static\comptage-mobile.css"; remote = "comptage-mobile.css"; dest = "/app/static/comptage-mobile.css" },
    @{ local = "static\manifest.json"; remote = "manifest.json"; dest = "/app/static/manifest.json" },
    @{ local = "kasoft\web\app.py"; remote = "app.py"; dest = "/app/kasoft/web/app.py" }
)

foreach ($f in $files) {
    $src = Join-Path $ProjectRoot $f.local
    if (-not (Test-Path $src)) {
        Write-Error "Fichier manquant: $src"
        exit 1
    }
}

Write-Host "==> Upload vers $Host" -ForegroundColor Cyan
foreach ($f in $files) {
    scp -i $KeyPath (Join-Path $ProjectRoot $f.local) "${Host}:~/$($f.remote)"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$copies = ($files | ForEach-Object { "sudo docker cp ~/$($_.remote) kasoft:$($_.dest)" }) -join "; "
$remote = @"
$copies
sudo docker restart kasoft
sleep 5
curl -sS -o /dev/null -w 'HTTP /mobile: %{http_code}\n' http://127.0.0.1:10000/mobile
"@

Write-Host "==> Mise à jour conteneur" -ForegroundColor Cyan
ssh -i $KeyPath $Host $remote
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "OK — http://51.170.128.73/mobile" -ForegroundColor Green
