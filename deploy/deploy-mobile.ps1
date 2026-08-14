# Déploie la version phone (dossier templates/phone + static/phone)
param(
    [string]$Host = "51.170.128.73",
    [string]$User = "ubuntu",
    [string]$KeyPath = "$HOME\kasoft-vm.key"
)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$files = @(
    @{ local = "templates\phone\comptage.html"; dest = "/app/templates/phone/comptage.html" },
    @{ local = "static\phone\app.css"; dest = "/app/static/phone/app.css" },
    @{ local = "static\phone\app.js"; dest = "/app/static/phone/app.js" },
    @{ local = "kasoft\web\app.py"; dest = "/app/kasoft/web/app.py" },
    @{ local = "kasoft\web\device.py"; dest = "/app/kasoft/web/device.py" },
    @{ local = "static\manifest.json"; dest = "/app/static/manifest.json" }
)

Write-Host "Deploy phone -> $User@${Host}" -ForegroundColor Cyan
foreach ($f in $files) {
    $src = Join-Path $root $f.local
    if (-not (Test-Path $src)) { throw "Missing: $src" }
    scp -i $KeyPath $src "${User}@${Host}:$($f.dest)"
}

ssh -i $KeyPath "${User}@${Host}" @"
docker restart kasoft
sleep 3
curl -sS -o /dev/null -w 'HTTP /phone: %{http_code}\n' http://127.0.0.1:10000/phone
"@

Write-Host "OK — http://${Host}/phone" -ForegroundColor Green
