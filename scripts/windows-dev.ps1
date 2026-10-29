param(
    [int]$ApiPort = 8080,
    [int]$WebPort = 5173,
    [string]$DataDir = "",
    [switch]$SkipSetup
)

$ErrorActionPreference = "Stop"
$Repo = Split-Path -Parent $PSScriptRoot
$env:UV_CACHE_DIR = if ($env:UV_CACHE_DIR) { $env:UV_CACHE_DIR } else { Join-Path $Repo ".uv-cache" }
New-Item -ItemType Directory -Force -Path $env:UV_CACHE_DIR | Out-Null

if (-not $SkipSetup) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Repo "scripts\windows-setup.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Windows setup failed (exit $LASTEXITCODE)." }
}

if (-not $DataDir) {
    $DataDir = Join-Path $env:LOCALAPPDATA "AuroraAgent"
}
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$previousData = $env:AURORA_AGENT_DATA
$env:AURORA_AGENT_DATA = $DataDir
$api = $null
$web = $null
$logDir = Join-Path $DataDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$apiOut = Join-Path $logDir "api.out.log"
$apiErr = Join-Path $logDir "api.err.log"
$webOut = Join-Path $logDir "web.out.log"
$webErr = Join-Path $logDir "web.err.log"
try {
    $apiCommand = "Set-Location -LiteralPath '$Repo'; `$env:UV_CACHE_DIR = '$($env:UV_CACHE_DIR)'; `$env:AURORA_AGENT_DATA = '$DataDir'; uv run oc start --host 127.0.0.1 --port $ApiPort"
    $webCommand = "Set-Location -LiteralPath '$(Join-Path $Repo 'web')'; npm.cmd run dev -- --host 127.0.0.1 --port $WebPort"
    $apiEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($apiCommand))
    $webEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($webCommand))
    $api = Start-Process powershell.exe -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $apiEncoded)
    $web = Start-Process powershell.exe -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $webOut -RedirectStandardError $webErr `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $webEncoded)

    Write-Host "AuroraAgent API: http://127.0.0.1:$ApiPort"
    Write-Host "AuroraAgent web: http://127.0.0.1:$WebPort"
    Write-Host "Logs: $logDir"
    Write-Host "Press Ctrl+C to stop both services."
    while ($true) {
        if ($api.HasExited) { throw "API process exited with code $($api.ExitCode)." }
        if ($web.HasExited) { throw "Web process exited with code $($web.ExitCode)." }
        Start-Sleep -Seconds 1
    }
}
finally {
    foreach ($process in @($web, $api)) {
        if ($process -and -not $process.HasExited) {
            taskkill.exe /PID $process.Id /T /F | Out-Null
        }
    }
    if ($null -eq $previousData) { Remove-Item Env:AURORA_AGENT_DATA -ErrorAction SilentlyContinue }
    else { $env:AURORA_AGENT_DATA = $previousData }
}
