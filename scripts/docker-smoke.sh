#!/usr/bin/env bash
set -euo pipefail

IMAGE="${1:-auroraagent:smoke}"

docker build -t "$IMAGE" .

# Run the same command the image exposes through ENTRYPOINT: oc smoke.
docker run --rm \
  -e AURORA_AGENT_DATA=/tmp/auroraagent-smoke \
  "$IMAGE" \
  smoke --static-dir /app/web/dist
