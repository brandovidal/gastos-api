##@ Database

.PHONY: deps generate db-deploy migrate seed studio

deps: env-file generate db-deploy seed ## After a pull: Prisma client, pending migrations, catalogs and bot command menu
	@if grep -Eq '^TELEGRAM_BOT_TOKEN=.+' $(ENV_FILE); then \
	  $(DOTENV) tsx scripts/telegram-setup.ts --optional-webhook; \
	else echo "TELEGRAM_BOT_TOKEN not set in $(ENV_FILE): bot menu skipped"; fi
	@echo "✔ $(ENV) ready"

generate: ## Generate the Prisma client (pnpm install does not: ignore-scripts=true)
	pnpm exec prisma generate

# Prisma Migrate cannot talk to remote Turso: scripts/db-deploy.ts applies the same SQL files there
db-deploy: env-file ## Apply pending migrations (SQLite: prisma migrate deploy, Turso: scripts/db-deploy.ts)
	@if grep -Eq '^DATABASE_URL="?file:' $(ENV_FILE); then \
	  $(DOTENV) prisma migrate deploy; \
	else $(DOTENV) tsx scripts/db-deploy.ts; fi

migrate: ## New migration on the local dev.db + client (NAME=add_something)
	@test -n "$(NAME)" || (echo "Usage: make migrate NAME=<migration_name>"; exit 1)
	$(DOTENV_DEV) -- prisma migrate dev --name $(NAME)
	pnpm exec prisma generate

seed: env-file ## Load or update catalogs (safe to re-run)
	$(DOTENV) tsx prisma/seed.ts

studio: env-file ## Open Prisma Studio
	$(DOTENV) prisma studio
