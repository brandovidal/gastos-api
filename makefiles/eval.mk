##@ AI golden set (P9)

.PHONY: eval-replay eval-ai

eval-replay: ## Score the recorded AI answers again (no AI calls)
	$(DOTENV_DEV) -v EVAL_REPLAY=1 -- vitest run --project eval

eval-ai: ## Golden set against the REAL AI (~30 calls of the daily quota): CONFIRM=yes [RECORD=1]
	@test "$(CONFIRM)" = "yes" || (echo "Calls the real AI (~30 requests of the free daily quota). Run: make eval-ai CONFIRM=yes [RECORD=1]"; exit 1)
	$(DOTENV_DEV) $(if $(RECORD),-v EVAL_RECORD=1,) -- vitest run --project eval
