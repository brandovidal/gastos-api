##@ Telegram bot

.PHONY: telegram tunnel secret

telegram: env-file ## Register webhook + command menu (URL=https://<public-url>, or PUBLIC_URL in the env file)
	$(DOTENV) tsx scripts/telegram-setup.ts $(URL)

tunnel: ## Local bot: cloudflared tunnel + webhook to it; Ctrl+C restores the production webhook (run pnpm dev apart)
	./scripts/tunnel.sh $(ENV_FILE)

secret: ## New random secret for API_KEY or TELEGRAM_WEBHOOK_SECRET
	@openssl rand -hex 32
