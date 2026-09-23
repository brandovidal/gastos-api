##@ Telegram bot

.PHONY: telegram

telegram: env-file ## Register webhook + command menu (URL=https://<public-url>, or PUBLIC_URL in the env file)
	$(DOTENV) tsx scripts/telegram-setup.ts $(URL)
