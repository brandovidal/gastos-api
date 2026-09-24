#!/usr/bin/env bash
# Local bot through a cloudflared quick tunnel (make tunnel):
#   1. opens https://<random>.trycloudflare.com → http://localhost:$PORT
#   2. points the Telegram webhook of the .env.dev bot to it
#   3. on Ctrl+C closes the tunnel; only when .env.dev and .env.prod share the bot token it points the webhook
#      back to production (PUBLIC_URL of .env.prod). With its own dev bot, production is never touched.
# Always .env.dev (local only). Run `pnpm dev` in another terminal.
set -uo pipefail

ENV_FILE=.env.dev
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE: copy .env.example"; exit 1; }
token_of() { grep -E '^TELEGRAM_BOT_TOKEN=' "$1" 2>/dev/null | cut -d= -f2 | tr -d '"'; }
SHARED_BOT=false
[ -f .env.prod ] && [ "$(token_of "$ENV_FILE")" = "$(token_of .env.prod)" ] && SHARED_BOT=true
PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2 | tr -d '"')"
PORT="${PORT:-5560}"
LOG="$(mktemp)"

command -v cloudflared >/dev/null || { echo "Install cloudflared: brew install cloudflared"; exit 1; }

cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate >"$LOG" 2>&1 &
TUNNEL_PID=$!

restore() {
  kill "$TUNNEL_PID" 2>/dev/null
  rm -f "$LOG" .tunnel-url
  if [ "$SHARED_BOT" = true ] && grep -Eq '^PUBLIC_URL=https://' .env.prod; then
    echo "Pointing the webhook back to production…"
    pnpm exec dotenv -e .env.prod -- tsx scripts/telegram-setup.ts ||
      echo "⚠️  The production webhook was NOT restored: run 'make telegram ENV=prod'"
  fi
}
trap restore EXIT
trap 'exit 130' INT TERM # Ctrl+C or kill: exit so the EXIT trap cleans up

URL=""
for _ in $(seq 1 30); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)"
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "cloudflared did not return a URL:"; cat "$LOG"; exit 1; }

# The quick tunnel URL takes a few seconds to resolve; Telegram rejects it until then ("Failed to resolve host")
echo "Waiting for ${URL}..."
for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/v1/health")" != "000" ] && break
  sleep 1
done

pnpm exec dotenv -e "$ENV_FILE" -- tsx scripts/telegram-setup.ts "$URL" || exit 1
echo "$URL" >.tunnel-url # make telegram (ENV=dev) re-registers the webhook to it while the tunnel runs
echo ""
if [ "$SHARED_BOT" = true ]; then
  echo "⚠️  .env.dev uses the production bot: production gets no messages until Ctrl+C (then it is restored)."
fi
echo "Tunnel $URL → http://localhost:$PORT (run 'pnpm dev' in another terminal). Ctrl+C stops it."
wait "$TUNNEL_PID"
