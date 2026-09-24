#!/usr/bin/env bash
# make dev (ENV=dev): local Redis + the API in watch mode + the Telegram tunnel of the .env.dev bot, stopped together
# with Ctrl+C (Redis keeps running: make redis-stop).
# The API reads .env.dev only when it starts: after editing it, stop and run make dev again.
set -uo pipefail

# Local Redis of the reminders (P20); without it the API still starts, with the scheduled jobs off
./scripts/redis.sh || echo "Redis not started: reminders are off"

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
