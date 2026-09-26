##@ Import (P14)

.PHONY: import-notion import-notion-reset import-commitments

# The Notion export of "Seguimiento financiero" (the 9 boards); "Pago de Prestamos" and "Pago de Terreno" (P27) sit next to it
NOTION_ROOT ?= ../docs/migrations/notion
NOTION_DIR ?= $(NOTION_ROOT)/Seguimiento financiero

import-notion: env-file ## Notion CSV exports → Kogane ([DIR=<folder>], default Seguimiento financiero): report only; CONFIRM=yes saves; RESET=yes CONFIRM=yes deletes what came from Notion first [ENV=prod]
	$(DOTENV) tsx scripts/import-notion.ts "$(or $(DIR),$(NOTION_DIR))" $(if $(filter yes,$(CONFIRM)),--confirm) $(if $(filter yes,$(RESET)),--reset)

import-notion-reset: env-file ## Deletes only what came from Notion (rows with importKey, their payments and imp_batches/imp_rows); CONFIRM=yes [ENV=prod]
	@test "$(CONFIRM)" = "yes" || (echo "Borra lo importado de Notion en $(ENV). Repite con CONFIRM=yes"; exit 1)
	$(DOTENV) tsx scripts/import-notion.ts "$(or $(DIR),$(NOTION_DIR))" --reset-only

import-commitments: env-file ## Notion "Pago de Prestamos" and "Pago de Terreno" → loans and investments (P27) ([DIR=<folder>], default docs/migrations/notion): report only; CONFIRM=yes saves [ENV=prod]
	$(DOTENV) tsx scripts/import-commitments.ts "$(or $(DIR),$(NOTION_ROOT))" $(if $(filter yes,$(CONFIRM)),--confirm)
