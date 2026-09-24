##@ Import (P14)

.PHONY: import-notion

import-notion: env-file ## Notion CSV exports → Kogane (DIR=<folder>): report only; CONFIRM=yes saves; RESET=yes CONFIRM=yes deletes what came from Notion first [ENV=prod]
	@test -n "$(DIR)" || (echo "Usage: make import-notion DIR=<folder with the CSV files> [CONFIRM=yes] [RESET=yes]"; exit 1)
	$(DOTENV) tsx scripts/import-notion.ts "$(DIR)" $(if $(filter yes,$(CONFIRM)),--confirm) $(if $(filter yes,$(RESET)),--reset)
