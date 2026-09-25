-- P30 (D114): the card a debt was charged on, and what each payment was. Only ADD COLUMN (D52).
ALTER TABLE "exp_debts" ADD COLUMN "paymentMethodId" TEXT REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "exp_debts_paymentMethodId_paymentYear_paymentMonth_idx" ON "exp_debts"("paymentMethodId", "paymentYear", "paymentMonth");

ALTER TABLE "exp_debt_payments" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'payment';

-- Debts of a shared card expense (D73) take the card of that expense (same draft); every installment of one purchase
-- is on the same card, so any row of the draft says it
UPDATE "exp_debts"
SET "paymentMethodId" = (
  SELECT MAX("c"."paymentMethodId") FROM "exp_credit_card_expenses" AS "c"
  WHERE "c"."draftId" = "exp_debts"."originDraftId" OR "c"."originDraftId" = "exp_debts"."originDraftId"
)
WHERE "originDraftId" IS NOT NULL AND "paymentMethodId" IS NULL;

-- Payments imported or registered before: a partial one was an "Abonado", a full one before the month "Amortizado"
UPDATE "exp_debt_payments" SET "kind" = 'partial'
WHERE "debtId" IN (SELECT "id" FROM "exp_debts" WHERE "status" = 'partial');
UPDATE "exp_debt_payments" SET "kind" = 'prepaid'
WHERE "debtId" IN (SELECT "id" FROM "exp_debts" WHERE "status" = 'prepaid');
