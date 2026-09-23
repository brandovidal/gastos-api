/*
  Warnings:

  - You are about to drop the column `storageKey` on the `bot_expense_drafts` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "bot_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'temporary',
    "expiresAt" DATETIME,
    "keptAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bot_expense_drafts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channel" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "itemIndex" INTEGER NOT NULL DEFAULT 0,
    "inputType" TEXT NOT NULL,
    "documentType" TEXT,
    "rawText" TEXT,
    "mediaFileId" TEXT,
    "mediaUniqueId" TEXT,
    "fileId" TEXT,
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
    "categoryId" TEXT,
    "confidence" TEXT NOT NULL DEFAULT '{}',
    "missingFields" TEXT NOT NULL DEFAULT '[]',
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bot_expense_drafts_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "bot_files" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bot_expense_drafts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bot_expense_drafts_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bot_expense_drafts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_bot_expense_drafts" ("amount", "categoryId", "channel", "chatId", "confidence", "confirmedAt", "createdAt", "currency", "description", "destination", "documentType", "exchangeRate", "expenseType", "id", "inputType", "installment", "itemIndex", "mediaFileId", "mediaUniqueId", "merchant", "messageId", "missingFields", "notes", "operationNumber", "paymentMethodId", "pendingField", "period", "personId", "rawText", "spentAt", "status", "updatedAt") SELECT "amount", "categoryId", "channel", "chatId", "confidence", "confirmedAt", "createdAt", "currency", "description", "destination", "documentType", "exchangeRate", "expenseType", "id", "inputType", "installment", "itemIndex", "mediaFileId", "mediaUniqueId", "merchant", "messageId", "missingFields", "notes", "operationNumber", "paymentMethodId", "pendingField", "period", "personId", "rawText", "spentAt", "status", "updatedAt" FROM "bot_expense_drafts";
DROP TABLE "bot_expense_drafts";
ALTER TABLE "new_bot_expense_drafts" RENAME TO "bot_expense_drafts";
CREATE INDEX "bot_expense_drafts_channel_chatId_status_idx" ON "bot_expense_drafts"("channel", "chatId", "status");
CREATE INDEX "bot_expense_drafts_channel_chatId_mediaUniqueId_idx" ON "bot_expense_drafts"("channel", "chatId", "mediaUniqueId");
CREATE INDEX "bot_expense_drafts_fileId_idx" ON "bot_expense_drafts"("fileId");
CREATE INDEX "bot_expense_drafts_destination_status_spentAt_idx" ON "bot_expense_drafts"("destination", "status", "spentAt");
CREATE UNIQUE INDEX "bot_expense_drafts_channel_chatId_messageId_itemIndex_key" ON "bot_expense_drafts"("channel", "chatId", "messageId", "itemIndex");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "bot_files_storageKey_key" ON "bot_files"("storageKey");

-- CreateIndex
CREATE INDEX "bot_files_status_expiresAt_idx" ON "bot_files"("status", "expiresAt");
