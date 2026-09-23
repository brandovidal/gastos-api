-- P17 (D38, D60): exp_accounts_receivable -> exp_debts (one row per installment) + exp_debt_payments.
-- exp_accounts_receivable is copied, not dropped: migrations run before the new code goes live (backward compatible).
-- A later migration drops it.

-- CreateTable
CREATE TABLE "exp_debts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" REAL,
    "amountInPen" REAL,
    "installment" TEXT,
    "paymentMonth" INTEGER NOT NULL,
    "paymentYear" INTEGER NOT NULL,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "paidDate" DATETIME,
    "personId" TEXT NOT NULL,
    "notes" TEXT,
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_debts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_debts_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exp_debt_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "debtId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "paymentMethodId" TEXT,
    "batchId" TEXT,
    "confirmedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exp_debt_payments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "exp_debts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "exp_debt_payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "exp_debts_draftId_key" ON "exp_debts"("draftId");

-- CreateIndex
CREATE INDEX "exp_debts_personId_direction_status_idx" ON "exp_debts"("personId", "direction", "status");

-- CreateIndex
CREATE INDEX "exp_debts_paymentYear_paymentMonth_idx" ON "exp_debts"("paymentYear", "paymentMonth");

-- CreateIndex
CREATE INDEX "exp_debt_payments_debtId_idx" ON "exp_debt_payments"("debtId");

-- CreateIndex
CREATE INDEX "exp_debt_payments_batchId_idx" ON "exp_debt_payments"("batchId");

-- Copy the receivables as debts owed to the user, paid ones with a confirmed payment for what was paid
INSERT INTO "exp_debts" ("id", "direction", "description", "amount", "currency", "exchangeRate", "amountInPen",
  "paymentMonth", "paymentYear", "dueDate", "status", "paidAmount", "paidDate", "personId", "notes", "draftId",
  "createdAt", "updatedAt")
SELECT "id", 'owed_to_me', "description", "amount", "currency", "exchangeRate", "amountInPen",
  CAST(strftime('%m', COALESCE("dueDate", "createdAt")) AS INTEGER),
  CAST(strftime('%Y', COALESCE("dueDate", "createdAt")) AS INTEGER),
  "dueDate", "status",
  CASE WHEN "status" = 'paid' THEN COALESCE("paidAmount", "amount") ELSE COALESCE("paidAmount", 0) END,
  "paidDate", "personId", "notes", "draftId", "createdAt", "updatedAt"
FROM "exp_accounts_receivable";

INSERT INTO "exp_debt_payments" ("id", "debtId", "amount", "paidAt", "confirmedAt", "notes", "createdAt")
SELECT 'migrated-' || "id", "id", "paidAmount", COALESCE("paidDate", "updatedAt"), COALESCE("paidDate", "updatedAt"),
  'Migrado de exp_accounts_receivable', strftime('%Y-%m-%dT%H:%M:%f+00:00', 'now')
FROM "exp_debts" WHERE "paidAmount" > 0;
