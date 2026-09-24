-- P21 (D47): the card of screenshots that do not show which one. A plain ADD COLUMN: no table redefinition.
ALTER TABLE "cat_payment_methods" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- P17 (D60): exp_accounts_receivable was copied into exp_debts by the "debts" migration and kept while the previous
-- code could still be running; nothing reads it anymore.
DROP INDEX IF EXISTS "exp_accounts_receivable_personId_idx";
DROP INDEX IF EXISTS "exp_accounts_receivable_status_idx";
DROP INDEX IF EXISTS "exp_accounts_receivable_draftId_key";
DROP TABLE IF EXISTS "exp_accounts_receivable";
