##@ App

.PHONY: dev dev\:only debug clean

# ENV=dev also opens the tunnel of the .env.dev bot (scripts/dev.sh); ENV=prod never does
dev: env-file ## API in watch mode + the bot tunnel (ENV=dev); only the API with ENV=prod
ifeq ($(ENV),dev)
	./scripts/dev.sh
else
	$(DOTENV) nest start --watch
endif

dev\:only: env-file ## Only the API in watch mode, without the tunnel (ENV=dev|prod)
	$(DOTENV) nest start --watch

debug: env-file ## Start the API with the debugger
	$(DOTENV) nest start --debug --watch

clean: ## Remove node_modules, dist, coverage and the generated Prisma client
	rm -rf node_modules dist coverage src/generated
