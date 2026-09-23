##@ App

.PHONY: dev debug clean

dev: env-file ## Start the API in watch mode (ENV=dev|prod)
	$(DOTENV) nest start --watch

debug: env-file ## Start the API with the debugger
	$(DOTENV) nest start --debug --watch

clean: ## Remove node_modules, dist, coverage and the generated Prisma client
	rm -rf node_modules dist coverage src/generated
