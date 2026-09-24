-- AlterTable
ALTER TABLE "exp_debts" ADD COLUMN "originDraftId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_exp_credit_card_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "othersShare" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" REAL,
    "amountInPen" REAL,
    "expenseType" TEXT NOT NULL DEFAULT 'essential',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "personId" TEXT NOT NULL,
    "categoryId" TEXT,
    "paymentMethodId" TEXT NOT NULL,
    "installment" TEXT,
    "paymentMonth" INTEGER NOT NULL,
    "paymentYear" INTEGER NOT NULL,
    "processDate" DATETIME,
    "notes" TEXT,
    "originDraftId" TEXT,
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_credit_card_expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_credit_card_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_credit_card_expenses_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_credit_card_expenses_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_exp_credit_card_expenses" ("amount", "amountInPen", "categoryId", "createdAt", "currency", "description", "draftId", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "personId", "processDate", "updatedAt") SELECT "amount", "amountInPen", "categoryId", "createdAt", "currency", "description", "draftId", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "personId", "processDate", "updatedAt" FROM "exp_credit_card_expenses";
DROP TABLE "exp_credit_card_expenses";
ALTER TABLE "new_exp_credit_card_expenses" RENAME TO "exp_credit_card_expenses";
CREATE UNIQUE INDEX "exp_credit_card_expenses_draftId_key" ON "exp_credit_card_expenses"("draftId");
CREATE INDEX "exp_credit_card_expenses_paymentMethodId_paymentMonth_paymentYear_idx" ON "exp_credit_card_expenses"("paymentMethodId", "paymentMonth", "paymentYear");
CREATE INDEX "exp_credit_card_expenses_personId_idx" ON "exp_credit_card_expenses"("personId");
CREATE INDEX "exp_credit_card_expenses_originDraftId_idx" ON "exp_credit_card_expenses"("originDraftId");
CREATE INDEX "exp_credit_card_expenses_paymentStatus_idx" ON "exp_credit_card_expenses"("paymentStatus");
CREATE TABLE "new_exp_daily_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "othersShare" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" REAL,
    "amountInPen" REAL,
    "expenseType" TEXT NOT NULL DEFAULT 'essential',
    "spentAt" DATETIME NOT NULL,
    "personId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "categoryId" TEXT,
    "merchant" TEXT,
    "operationNumber" TEXT,
    "notes" TEXT,
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_daily_expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_daily_expenses_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_daily_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_daily_expenses_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_exp_daily_expenses" ("amount", "amountInPen", "categoryId", "createdAt", "currency", "description", "draftId", "exchangeRate", "expenseType", "id", "merchant", "notes", "operationNumber", "paymentMethodId", "personId", "spentAt", "updatedAt") SELECT "amount", "amountInPen", "categoryId", "createdAt", "currency", "description", "draftId", "exchangeRate", "expenseType", "id", "merchant", "notes", "operationNumber", "paymentMethodId", "personId", "spentAt", "updatedAt" FROM "exp_daily_expenses";
DROP TABLE "exp_daily_expenses";
ALTER TABLE "new_exp_daily_expenses" RENAME TO "exp_daily_expenses";
CREATE UNIQUE INDEX "exp_daily_expenses_draftId_key" ON "exp_daily_expenses"("draftId");
CREATE INDEX "exp_daily_expenses_spentAt_idx" ON "exp_daily_expenses"("spentAt");
CREATE INDEX "exp_daily_expenses_personId_idx" ON "exp_daily_expenses"("personId");
CREATE INDEX "exp_daily_expenses_categoryId_idx" ON "exp_daily_expenses"("categoryId");
CREATE TABLE "new_exp_fixed_costs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "othersShare" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" REAL,
    "amountInPen" REAL,
    "expenseType" TEXT NOT NULL DEFAULT 'essential',
    "paymentStatus" TEXT NOT NULL DEFAULT 'not_started',
    "personId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "installment" TEXT,
    "paymentMonth" INTEGER NOT NULL,
    "paymentYear" INTEGER NOT NULL,
    "paymentDate" DATETIME,
    "dueDate" DATETIME,
    "attentionDate" DATETIME,
    "notes" TEXT,
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_fixed_costs_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_fixed_costs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_fixed_costs_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_fixed_costs_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_exp_fixed_costs" ("amount", "amountInPen", "attentionDate", "categoryId", "createdAt", "currency", "description", "draftId", "dueDate", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentDate", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "personId", "updatedAt") SELECT "amount", "amountInPen", "attentionDate", "categoryId", "createdAt", "currency", "description", "draftId", "dueDate", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentDate", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "personId", "updatedAt" FROM "exp_fixed_costs";
DROP TABLE "exp_fixed_costs";
ALTER TABLE "new_exp_fixed_costs" RENAME TO "exp_fixed_costs";
CREATE UNIQUE INDEX "exp_fixed_costs_draftId_key" ON "exp_fixed_costs"("draftId");
CREATE INDEX "exp_fixed_costs_paymentMonth_paymentYear_idx" ON "exp_fixed_costs"("paymentMonth", "paymentYear");
CREATE INDEX "exp_fixed_costs_categoryId_idx" ON "exp_fixed_costs"("categoryId");
CREATE INDEX "exp_fixed_costs_personId_idx" ON "exp_fixed_costs"("personId");
CREATE INDEX "exp_fixed_costs_paymentStatus_idx" ON "exp_fixed_costs"("paymentStatus");
CREATE TABLE "new_exp_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "othersShare" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" REAL,
    "amountInPen" REAL,
    "expenseType" TEXT NOT NULL DEFAULT 'essential',
    "paymentStatus" TEXT NOT NULL DEFAULT 'not_started',
    "period" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "categoryId" TEXT,
    "paymentMethodId" TEXT,
    "installment" TEXT,
    "paymentMonth" INTEGER NOT NULL,
    "paymentYear" INTEGER NOT NULL,
    "paymentDate" DATETIME,
    "dueDate" DATETIME,
    "notes" TEXT,
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_subscriptions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_subscriptions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_subscriptions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_subscriptions_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_exp_subscriptions" ("amount", "amountInPen", "categoryId", "createdAt", "currency", "description", "draftId", "dueDate", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentDate", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "period", "personId", "updatedAt") SELECT "amount", "amountInPen", "categoryId", "createdAt", "currency", "description", "draftId", "dueDate", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentDate", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "period", "personId", "updatedAt" FROM "exp_subscriptions";
DROP TABLE "exp_subscriptions";
ALTER TABLE "new_exp_subscriptions" RENAME TO "exp_subscriptions";
CREATE UNIQUE INDEX "exp_subscriptions_draftId_key" ON "exp_subscriptions"("draftId");
CREATE INDEX "exp_subscriptions_paymentMonth_paymentYear_idx" ON "exp_subscriptions"("paymentMonth", "paymentYear");
CREATE INDEX "exp_subscriptions_personId_idx" ON "exp_subscriptions"("personId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "exp_debts_originDraftId_idx" ON "exp_debts"("originDraftId");
