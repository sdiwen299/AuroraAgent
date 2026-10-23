param(
    [string]$Image = "auroraagent:smoke"
)

$ErrorActionPreference = "Stop"

docker build -t $Image .
if ($LASTEXITCODE -ne 0) { throw "Docker build failed (exit $LASTEXITCODE)." }

# Run the same command the image exposes through ENTRYPOINT: oc smoke.
docker run --rm `
    -e AURORA_AGENT_DATA=/tmp/auroraagent-smoke `
    $Image `
    smoke --static-dir /app/web/dist
if ($LASTEXITCODE -ne 0) { throw "Docker smoke failed (exit $LASTEXITCODE)." }
