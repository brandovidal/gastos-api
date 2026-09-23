##@ Quality

.PHONY: lint format build test test-integration check

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
