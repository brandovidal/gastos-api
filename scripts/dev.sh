#!/usr/bin/env bash
# make dev (ENV=dev): the API in watch mode + the Telegram tunnel of the .env.dev bot, stopped together with Ctrl+C.
# The API reads .env.dev only when it starts: after editing it, stop and run make dev again.
set -uo pipefail

# Started from a script, the tunnel ignores Ctrl+C (SIGINT): it is stopped with TERM, which runs its cleanup
./scripts/tunnel.sh &
TUNNEL_PID=$!

stop_tunnel() {
  kill -TERM "$TUNNEL_PID" 2>/dev/null
  wait "$TUNNEL_PID" 2>/dev/null
}
trap stop_tunnel EXIT
trap 'exit 130' INT TERM

pnpm exec dotenv -e .env.dev -- nest start --watch
