##@ Recognition of bank screenshots (P21)

.PHONY: ocr-probe

ocr-probe: ## Free local OCR test (no AI): amounts, dates and screen type per screenshot (DIR=<folder>, default test/golden/images)
	pnpm exec tsx scripts/ocr-probe.ts $(DIR)
