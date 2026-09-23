##@ Production image (P10)

.PHONY: docker

docker: ## Build the production image like Railway and check that it starts (/v1/health 200, /docs 404); CI runs it before deploying
	./scripts/docker-smoke.sh
