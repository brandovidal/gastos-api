-- D50: "Bandeja" is now "Borrador". Data-only migration: expenses kept for later move to the new status.
UPDATE "bot_expense_drafts" SET "status" = 'pending_review' WHERE "status" = 'inbox';
