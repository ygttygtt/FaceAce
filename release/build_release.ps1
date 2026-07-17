param(
    [string]$Version = "0.4.3"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Frontend = Join-Path $Root "frontend"
$Backend = Join-Path $Root "backend"
$Python = Join-Path $Backend ".venv\Scripts\python.exe"
$DistRoot = Join-Path $PSScriptRoot "dist"
$WorkRoot = Join-Path $PSScriptRoot "build"
$StageRoot = Join-Path $WorkRoot "dist"
$AppDir = Join-Path $StageRoot "FaceAce"
$FinalAppDir = Join-Path $DistRoot "FaceAce-v$Version-win64"
$ZipPath = Join-Path $DistRoot "FaceAce-v$Version-win64.zip"

if (-not (Test-Path -LiteralPath $Python)) {
    throw "Python virtual environment not found: $Python. Run dev.bat first."
}

Write-Host "[1/5] Installing release dependencies..."
& $Python -m pip install -r (Join-Path $Backend "requirements-release.txt")

Write-Host "[2/5] Building frontend..."
& $Python (Join-Path $PSScriptRoot "build_brand_assets.py")
if ($LASTEXITCODE -ne 0) { throw "Brand asset build failed" }
Push-Location $Frontend
try {
    $env:VITE_API_BASE = "http://127.0.0.1:8000"
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
} finally {
    Remove-Item Env:VITE_API_BASE -ErrorAction SilentlyContinue
    Pop-Location
}

if (Test-Path -LiteralPath $WorkRoot) {
    $Resolved = (Resolve-Path -LiteralPath $WorkRoot).Path
    if (-not $Resolved.StartsWith($PSScriptRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean a path outside release directory: $Resolved"
    }
    Remove-Item -LiteralPath $Resolved -Recurse -Force
}

if (Test-Path -LiteralPath $FinalAppDir) {
    throw "Target app directory already exists; preserving it to avoid data loss: $FinalAppDir"
}

New-Item -ItemType Directory -Path $DistRoot, $WorkRoot, $StageRoot -Force | Out-Null

Write-Host "[3/5] Packaging FaceAce.exe..."
& $Python -m PyInstaller `
    (Join-Path $PSScriptRoot "launcher.py") `
    --name FaceAce `
    --onedir `
    --windowed `
    --noconfirm `
    --clean `
    --paths $Backend `
    --hidden-import app.main `
    --add-data "$(Join-Path $Frontend 'dist');web" `
    --add-data "$(Join-Path $PSScriptRoot 'assets\faceace-logo.png');brand" `
    --icon (Join-Path $PSScriptRoot "assets\faceace.ico") `
    --distpath $StageRoot `
    --workpath $WorkRoot `
    --specpath $WorkRoot `
    --exclude-module pytest
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed" }

Write-Host "[4/5] Preparing portable directory..."
New-Item -ItemType Directory -Path (Join-Path $AppDir "data"), (Join-Path $AppDir "logs") -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "README_RELEASE.txt") -Destination (Join-Path $AppDir "README.txt")

Write-Host "[5/5] Creating ZIP..."
if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
Compress-Archive -Path (Join-Path $AppDir "*") -DestinationPath $ZipPath -CompressionLevel Optimal
Copy-Item -LiteralPath $AppDir -Destination $FinalAppDir -Recurse

Write-Host ""
Write-Host "Build complete:"
Write-Host "  App: $FinalAppDir\FaceAce.exe"
Write-Host "  ZIP: $ZipPath"
