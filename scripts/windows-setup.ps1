param(
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$env:UV_CACHE_DIR = if ($env:UV_CACHE_DIR) { $env:UV_CACHE_DIR } else { Join-Path $Repo ".uv-cache" }
New-Item -ItemType Directory -Force -Path $env:UV_CACHE_DIR | Out-Null

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $Hint"
    }
}

Require-Command "uv" "Install uv from https://docs.astral.sh/uv/getting-started/installation/"
Require-Command "node" "Install Node.js 20 or newer from https://nodejs.org/"
Require-Command "npm.cmd" "Install Node.js, then reopen PowerShell."
$nodeVersion = [version]((node --version) -replace '^v', '')
if ($nodeVersion -lt [version]"20.0") {
    throw "Node.js 20 or newer is required; found $nodeVersion."
}

Push-Location $Repo
try {
    uv sync --frozen --python 3.12
    if ($LASTEXITCODE -ne 0) { throw "Backend environment setup failed (exit $LASTEXITCODE)." }

    if (-not $SkipFrontend) {
        Push-Location (Join-Path $Repo "web")
        try {
            if (-not (Test-Path -LiteralPath (Join-Path (Get-Location) "node_modules\vite\bin\vite.js"))) {
                npm.cmd ci
                if ($LASTEXITCODE -ne 0) { throw "Frontend dependency setup failed (exit $LASTEXITCODE)." }
            }
            else {
                Write-Host "Existing frontend dependencies found; leaving node_modules unchanged."
            }
        }
        finally { Pop-Location }
    }
}
finally { Pop-Location }

Write-Host "AuroraAgent Windows environment is ready."
Write-Host "Start development with: powershell -ExecutionPolicy Bypass -File .\scripts\windows-dev.ps1"
