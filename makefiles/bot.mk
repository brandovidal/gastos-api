##@ Telegram bot

.PHONY: telegram tunnel secret

# ENV=dev: the URL of the running `make tunnel` (.tunnel-url); without a tunnel it only shows the webhook (--info)
TUNNEL_URL := $(shell cat .tunnel-url 2>/dev/null)
TELEGRAM_ARGS := $(if $(URL),$(URL),$(if $(filter dev,$(ENV)),$(if $(TUNNEL_URL),$(TUNNEL_URL),--info)))

telegram: env-file ## Webhook + command menu (URL=https://…, PUBLIC_URL of ENV=prod, or the running tunnel in dev)
	$(DOTENV) tsx scripts/telegram-setup.ts $(TELEGRAM_ARGS)

tunnel: ## Local bot (always .env.dev): cloudflared tunnel + webhook to it; run pnpm dev apart
	./scripts/tunnel.sh

secret: ## New random secret for API_KEY or TELEGRAM_WEBHOOK_SECRET
	@openssl rand -hex 32
