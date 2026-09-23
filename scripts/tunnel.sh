#!/usr/bin/env bash
# Local bot through a cloudflared quick tunnel (make tunnel):
#   1. opens https://<random>.trycloudflare.com → http://localhost:$PORT
#   2. points the Telegram webhook of the .env.dev bot to it
#   3. on Ctrl+C closes the tunnel and points the webhook back to production (PUBLIC_URL of .env.prod),
#      so the production bot keeps working when both environments share the same bot
# Run `pnpm dev` in another terminal.
set -uo pipefail

ENV_FILE="${1:-.env.dev}"
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '"')"
PORT="${PORT:-5560}"
LOG="$(mktemp)"

command -v cloudflared >/dev/null || { echo "Install cloudflared: brew install cloudflared"; exit 1; }

cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate >"$LOG" 2>&1 &
TUNNEL_PID=$!

restore() {
  kill "$TUNNEL_PID" 2>/dev/null
  rm -f "$LOG"
  if [ -f .env.prod ] && grep -Eq '^PUBLIC_URL=https://' .env.prod; then
    echo "Pointing the webhook back to production…"
    pnpm exec dotenv -e .env.prod -- tsx scripts/telegram-setup.ts
  fi
}
trap restore EXIT

URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "cloudflared did not return a URL:"; cat "$LOG"; exit 1; }

pnpm exec dotenv -e "$ENV_FILE" -- tsx scripts/telegram-setup.ts "$URL" || exit 1
echo ""
echo "Tunnel $URL → http://localhost:$PORT (run 'pnpm dev' in another terminal). Ctrl+C stops it and restores production."
wait "$TUNNEL_PID"
