# kogane-api tasks. ENV=local (.env.local, SQLite dev.db, default) or ENV=dev (.env.dev, Turso).
# Compatible with GNU Make 3.81 (macOS). package.json keeps only what CI, husky and Railway call.
ENV ?= local
ENV_FILE := .env.$(ENV)
DOTENV := pnpm exec dotenv -e $(ENV_FILE) --
DOTENV_LOCAL := pnpm exec dotenv -e .env.local
DOTENV_TEST := pnpm exec dotenv -e .env.test

.DEFAULT_GOAL := help
.PHONY: help env-file dev debug deps generate db-deploy migrate seed studio telegram \
	lint format build test test-integration check eval-replay eval-ai clean

help: ## Show the available tasks
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  ENV=local (default, .env.local, SQLite) | ENV=dev (.env.dev, Turso)"

env-file:
	@test -f $(ENV_FILE) || (echo "Missing $(ENV_FILE): copy .env.example"; exit 1)

# ---------- Run ----------

dev: env-file ## Start the API in watch mode (ENV=local|dev)
	$(DOTENV) nest start --watch

debug: env-file ## Start the API with the debugger
	$(DOTENV) nest start --debug --watch

# ---------- Database and bot ----------

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
	$(DOTENV_LOCAL) -- prisma migrate dev --name $(NAME)
	pnpm exec prisma generate

seed: env-file ## Load or update catalogs (safe to re-run)
	$(DOTENV) tsx prisma/seed.ts

studio: env-file ## Open Prisma Studio
	$(DOTENV) prisma studio

telegram: env-file ## Register webhook + command menu (URL=https://<public-url>, or PUBLIC_URL in the env file)
	$(DOTENV) tsx scripts/telegram-setup.ts $(URL)

# ---------- Quality ----------

lint: ## ESLint
	pnpm lint

format: ## Prettier
	pnpm format

build: ## Compile to dist/
	pnpm build

test: ## Unit tests in watch mode
	$(DOTENV_TEST) -- vitest --project unit

test-integration: ## Integration tests against a fresh SQLite (conversation flows replay recorded AI answers)
	pnpm test:integration

check: lint build ## Lint, build, unit and integration tests (what CI runs)
	pnpm test:ci
	pnpm test:integration

# ---------- AI golden set (P9) ----------

eval-replay: ## Score the recorded AI answers again (no AI calls)
	$(DOTENV_LOCAL) -v EVAL_REPLAY=1 -- vitest run --project eval

eval-ai: ## Golden set against the REAL AI (~30 calls of the daily quota): CONFIRM=yes [RECORD=1]
	@test "$(CONFIRM)" = "yes" || (echo "Calls the real AI (~30 requests of the free daily quota). Run: make eval-ai CONFIRM=yes [RECORD=1]"; exit 1)
	$(DOTENV_LOCAL) $(if $(RECORD),-v EVAL_RECORD=1,) -- vitest run --project eval

# ---------- Misc ----------

clean: ## Remove node_modules, dist, coverage and the generated Prisma client
	rm -rf node_modules dist coverage src/generated
