/*
  Warnings:

  - You are about to drop the column `intakeItemId` on the `accounts_receivable` table. All the data in the column will be lost.
  - You are about to drop the column `intakeItemId` on the `credit_card_expenses` table. All the data in the column will be lost.
  - You are about to drop the column `intakeItemId` on the `fixed_costs` table. All the data in the column will be lost.
  - You are about to drop the column `intakeItemId` on the `subscriptions` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "expense_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL DEFAULT 0,
    "inputType" TEXT NOT NULL,
    "documentType" TEXT,
    "rawText" TEXT,
    "mediaFileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "pendingField" TEXT,
    "destination" TEXT,
    "description" TEXT,
    "amount" REAL,
    "currency" TEXT,
    "exchangeRate" REAL,
    "spentAt" DATETIME,
    "expenseType" TEXT,
    "installment" TEXT,
    "period" TEXT,
    "merchant" TEXT,
    "operationNumber" TEXT,
    "notes" TEXT,
    "personId" TEXT,
    "paymentMethodId" TEXT,
    "creditCardId" TEXT,
    "categoryId" TEXT,
    "confidence" TEXT NOT NULL DEFAULT '{}',
    "missingFields" TEXT NOT NULL DEFAULT '[]',
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "expense_files_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "expense_files_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "expense_files_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "expense_files_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_request_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "expenseFileId" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_request_logs_expenseFileId_fkey" FOREIGN KEY ("expenseFileId") REFERENCES "expense_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_accounts_receivable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" REAL,
    "amountInPen" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "personId" TEXT NOT NULL,
    "dueDate" DATETIME,
    "paidDate" DATETIME,
    "paidAmount" REAL,
    "notes" TEXT,
    "expenseFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "accounts_receivable_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "accounts_receivable_expenseFileId_fkey" FOREIGN KEY ("expenseFileId") REFERENCES "expense_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_accounts_receivable" ("amount", "amountInPen", "createdAt", "currency", "description", "dueDate", "exchangeRate", "id", "notes", "paidAmount", "paidDate", "personId", "status", "updatedAt") SELECT "amount", "amountInPen", "createdAt", "currency", "description", "dueDate", "exchangeRate", "id", "notes", "paidAmount", "paidDate", "personId", "status", "updatedAt" FROM "accounts_receivable";
DROP TABLE "accounts_receivable";
ALTER TABLE "new_accounts_receivable" RENAME TO "accounts_receivable";
CREATE UNIQUE INDEX "accounts_receivable_expenseFileId_key" ON "accounts_receivable"("expenseFileId");
CREATE INDEX "accounts_receivable_status_idx" ON "accounts_receivable"("status");
CREATE INDEX "accounts_receivable_personId_idx" ON "accounts_receivable"("personId");
CREATE TABLE "new_credit_card_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "exchangeRate" REAL,
    "amountInPen" REAL,
    "expenseType" TEXT NOT NULL DEFAULT 'essential',
    "paymentStatus" TEXT NOT NULL DEFAULT 'pending',
    "personId" TEXT NOT NULL,
    "categoryId" TEXT,
    "creditCardId" TEXT NOT NULL,
    "installment" TEXT,
    "paymentMonth" INTEGER NOT NULL,
    "paymentYear" INTEGER NOT NULL,
    "processDate" DATETIME,
    "notes" TEXT,
    "expenseFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "credit_card_expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "credit_card_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "credit_card_expenses_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "credit_card_expenses_expenseFileId_fkey" FOREIGN KEY ("expenseFileId") REFERENCES "expense_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_credit_card_expenses" ("amount", "amountInPen", "categoryId", "createdAt", "creditCardId", "currency", "description", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentMonth", "paymentStatus", "paymentYear", "personId", "processDate", "updatedAt") SELECT "amount", "amountInPen", "categoryId", "createdAt", "creditCardId", "currency", "description", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentMonth", "paymentStatus", "paymentYear", "personId", "processDate", "updatedAt" FROM "credit_card_expenses";
DROP TABLE "credit_card_expenses";
ALTER TABLE "new_credit_card_expenses" RENAME TO "credit_card_expenses";
CREATE UNIQUE INDEX "credit_card_expenses_expenseFileId_key" ON "credit_card_expenses"("expenseFileId");
CREATE INDEX "credit_card_expenses_creditCardId_paymentMonth_paymentYear_idx" ON "credit_card_expenses"("creditCardId", "paymentMonth", "paymentYear");
CREATE INDEX "credit_card_expenses_personId_idx" ON "credit_card_expenses"("personId");
CREATE INDEX "credit_card_expenses_paymentStatus_idx" ON "credit_card_expenses"("paymentStatus");
CREATE TABLE "new_fixed_costs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
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
    "expenseFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "fixed_costs_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fixed_costs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fixed_costs_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "fixed_costs_expenseFileId_fkey" FOREIGN KEY ("expenseFileId") REFERENCES "expense_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_fixed_costs" ("amount", "amountInPen", "attentionDate", "categoryId", "createdAt", "currency", "description", "dueDate", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentDate", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "personId", "updatedAt") SELECT "amount", "amountInPen", "attentionDate", "categoryId", "createdAt", "currency", "description", "dueDate", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentDate", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "personId", "updatedAt" FROM "fixed_costs";
DROP TABLE "fixed_costs";
ALTER TABLE "new_fixed_costs" RENAME TO "fixed_costs";
CREATE UNIQUE INDEX "fixed_costs_expenseFileId_key" ON "fixed_costs"("expenseFileId");
CREATE INDEX "fixed_costs_paymentMonth_paymentYear_idx" ON "fixed_costs"("paymentMonth", "paymentYear");
CREATE INDEX "fixed_costs_categoryId_idx" ON "fixed_costs"("categoryId");
CREATE INDEX "fixed_costs_personId_idx" ON "fixed_costs"("personId");
CREATE INDEX "fixed_costs_paymentStatus_idx" ON "fixed_costs"("paymentStatus");
CREATE TABLE "new_subscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
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
    "expenseFileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "subscriptions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_expenseFileId_fkey" FOREIGN KEY ("expenseFileId") REFERENCES "expense_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_subscriptions" ("amount", "amountInPen", "categoryId", "createdAt", "currency", "description", "dueDate", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentDate", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "period", "personId", "updatedAt") SELECT "amount", "amountInPen", "categoryId", "createdAt", "currency", "description", "dueDate", "exchangeRate", "expenseType", "id", "installment", "notes", "paymentDate", "paymentMethodId", "paymentMonth", "paymentStatus", "paymentYear", "period", "personId", "updatedAt" FROM "subscriptions";
DROP TABLE "subscriptions";
ALTER TABLE "new_subscriptions" RENAME TO "subscriptions";
CREATE UNIQUE INDEX "subscriptions_expenseFileId_key" ON "subscriptions"("expenseFileId");
CREATE INDEX "subscriptions_paymentMonth_paymentYear_idx" ON "subscriptions"("paymentMonth", "paymentYear");
CREATE INDEX "subscriptions_personId_idx" ON "subscriptions"("personId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "expense_files_channel_chatId_status_idx" ON "expense_files"("channel", "chatId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "expense_files_channel_chatId_messageId_itemIndex_key" ON "expense_files"("channel", "chatId", "messageId", "itemIndex");

-- CreateIndex
CREATE INDEX "ai_request_logs_provider_model_createdAt_idx" ON "ai_request_logs"("provider", "model", "createdAt");
