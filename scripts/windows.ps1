param(
    [ValidateSet('Setup', 'Start', 'Verify')]
    [string]$Action = 'Start',
    [ValidateRange(1, 65535)]
    [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $PSScriptRoot
$previousCache = $env:UV_CACHE_DIR
$previousData = $env:AURORA_AGENT_DATA
Push-Location $Repo
try {
    $env:UV_CACHE_DIR = Join-Path $Repo '.cache/uv'
    if (-not $env:AURORA_AGENT_DATA) {
        $env:AURORA_AGENT_DATA = Join-Path $Repo '.runtime/data'
    }
    $python = Join-Path $Repo '.venv/Scripts/python.exe'
    $oc = Join-Path $Repo '.venv/Scripts/oc.exe'
    if ($Action -eq 'Setup') {
        if (-not (Get-Command uv -ErrorAction SilentlyContinue)) { throw 'Install uv first.' }
        if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'Install Node.js and npm first.' }
        uv sync --locked --python 3.12
        if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
        Push-Location (Join-Path $Repo 'web')
        try {
            npm.cmd ci --cache (Join-Path $Repo '.cache/npm')
            if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
            npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
        }
        finally { Pop-Location }
    }
    else {
        if (-not (Test-Path $python)) { throw 'Run this script with -Action Setup first.' }
        if (-not (Test-Path 'web/dist/index.html')) { throw 'Frontend missing. Run -Action Setup first.' }
        if ($Action -eq 'Verify') {
            & $oc verify --profile local --static-dir web/dist
        }
        else {
            & $oc start --host 127.0.0.1 --port $Port
        }
        if ($LASTEXITCODE -ne 0) { throw "Backend command failed: $LASTEXITCODE" }
    }
}
finally {
    Pop-Location
    $env:UV_CACHE_DIR = $previousCache
    $env:AURORA_AGENT_DATA = $previousData
}
