-- P26 (D107): kinds of exp_subscriptions, templates with kind and period, bank of debit cards and the budget switches.
-- Only ADD COLUMN: no table is recreated, so the previous version keeps working while this deploys (D52).

ALTER TABLE "cat_payment_methods" ADD COLUMN "bank" TEXT;
-- The debit cards so far are named after their bank (Interbank, BCP)
UPDATE "cat_payment_methods" SET "bank" = "name" WHERE "type" = 'debit_card';

ALTER TABLE "exp_subscriptions" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE "exp_subscriptions" ADD COLUMN "supplyNumber" TEXT;
CREATE INDEX "exp_subscriptions_kind_idx" ON "exp_subscriptions"("kind");

ALTER TABLE "exp_recurring_expenses" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'platform';
ALTER TABLE "exp_recurring_expenses" ADD COLUMN "period" TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE "exp_recurring_expenses" ADD COLUMN "supplyNumber" TEXT;

CREATE TABLE "bud_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "recurringCount" BOOLEAN NOT NULL DEFAULT true,
    "platformsCount" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
