-- P26 (D107): "Nuevo" of Recurrentes creates a draft of a service, so the draft carries the kind and supply number
ALTER TABLE "bot_expense_drafts" ADD COLUMN "kind" TEXT;
ALTER TABLE "bot_expense_drafts" ADD COLUMN "supplyNumber" TEXT;
