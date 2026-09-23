##@ Production image (P10)

.PHONY: docker

docker: ## Build the production image and run it on :5570 against a copy of dev.db (no tokens, /docs must be 404)
	docker build -t kogane-api:local .
	mkdir -p .docker-data && cp dev.db .docker-data/app.db
	docker run --rm -p 5570:8080 -e PORT=8080 -e DATABASE_URL=file:/data/app.db -v "$(CURDIR)/.docker-data:/data" kogane-api:local
