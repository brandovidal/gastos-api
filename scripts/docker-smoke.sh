#!/usr/bin/env bash
# Builds the production image and checks that it starts and answers /v1/health (P10).
# No secrets: empty SQLite, local storage (STORAGE_ENV=test), no Telegram token. `make docker`, also run by CI before
# every deploy.
set -euo pipefail

IMAGE=kogane-api:smoke
NAME=kogane-api-smoke
PORT=5571

docker build -t "$IMAGE" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "$PORT:8080" -e PORT=8080 -e DATABASE_URL=file:/tmp/app.db \
  -e STORAGE_ENV=test -e STORAGE_LOCAL_DIR=/tmp/storage "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 60); do
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" != "true" ]; then
    echo "✗ The container stopped while starting:"
    docker logs "$NAME"
    exit 1
  fi
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/v1/health" || true)
  if [ "$code" = "200" ]; then
    docs=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/docs" || true)
    if [ "$docs" != "404" ]; then
      echo "✗ /docs answered $docs: Swagger must be off in production"
      exit 1
    fi
    echo "✓ The image starts, /v1/health answers 200 and /docs 404"
    exit 0
  fi
  sleep 1
done

echo "✗ /v1/health did not answer 200 in 60 s (last: $code):"
docker logs "$NAME"
exit 1
