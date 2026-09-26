-- P23 (D82–D84): users, sessions and a userId in every table of data. Backward compatible: userId is nullable
-- DropIndex
DROP INDEX "bot_expense_drafts_channel_chatId_messageId_itemIndex_key";

-- DropIndex
DROP INDEX "bud_budget_groups_name_key";

-- DropIndex
DROP INDEX "bud_monthly_budgets_month_year_key";

-- DropIndex
DROP INDEX "cat_categories_name_key";

-- DropIndex
DROP INDEX "cat_payment_methods_code_key";

-- DropIndex
DROP INDEX "cat_payment_methods_name_key";

-- DropIndex
DROP INDEX "cat_people_name_key";

-- DropIndex
DROP INDEX "ntf_notifications_dedupeKey_key";

-- AlterTable
ALTER TABLE "aud_changes" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "bot_expense_drafts" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "bot_files" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "bud_budget_groups" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "bud_category_budgets" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "bud_incomes" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "bud_monthly_budgets" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "cat_card_holders" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "cat_categories" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "cat_payment_methods" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "cat_people" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_attachments" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_commitments" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_contributions" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_credit_card_expenses" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_daily_expenses" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_debt_payments" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_debts" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_fixed_costs" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_recurring_expenses" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "exp_subscriptions" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "imp_batches" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "imp_rows" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "imp_statement_rows" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "imp_statements" ADD COLUMN "userId" TEXT;

-- AlterTable
ALTER TABLE "ntf_notifications" ADD COLUMN "userId" TEXT;

-- CreateTable
CREATE TABLE "auth_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleSub" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "telegramChatId" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "auth_invites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "payload" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "auth_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The data that existed before P23 belongs to one user (D82): it gets its owner, who is claimed later with
-- `make owner EMAIL=<email>`. The audit triggers skip these updates (source = import)
INSERT INTO "auth_users" ("id", "name", "email", "role", "status", "updatedAt") VALUES ('legacy-owner', 'Yo', 'owner@kogane.invalid', 'member', 'invited', CURRENT_TIMESTAMP);
UPDATE "aud_context" SET "source" = 'import' WHERE "id" = 1;
UPDATE "aud_changes" SET "userId" = 'legacy-owner';
UPDATE "bot_expense_drafts" SET "userId" = 'legacy-owner';
UPDATE "bot_files" SET "userId" = 'legacy-owner';
UPDATE "bud_budget_groups" SET "userId" = 'legacy-owner';
UPDATE "bud_category_budgets" SET "userId" = 'legacy-owner';
UPDATE "bud_incomes" SET "userId" = 'legacy-owner';
UPDATE "bud_monthly_budgets" SET "userId" = 'legacy-owner';
UPDATE "cat_card_holders" SET "userId" = 'legacy-owner';
UPDATE "cat_categories" SET "userId" = 'legacy-owner';
UPDATE "cat_payment_methods" SET "userId" = 'legacy-owner';
UPDATE "cat_people" SET "userId" = 'legacy-owner';
UPDATE "exp_attachments" SET "userId" = 'legacy-owner';
UPDATE "exp_commitments" SET "userId" = 'legacy-owner';
UPDATE "exp_contributions" SET "userId" = 'legacy-owner';
UPDATE "exp_credit_card_expenses" SET "userId" = 'legacy-owner';
UPDATE "exp_daily_expenses" SET "userId" = 'legacy-owner';
UPDATE "exp_debt_payments" SET "userId" = 'legacy-owner';
UPDATE "exp_debts" SET "userId" = 'legacy-owner';
UPDATE "exp_fixed_costs" SET "userId" = 'legacy-owner';
UPDATE "exp_recurring_expenses" SET "userId" = 'legacy-owner';
UPDATE "exp_subscriptions" SET "userId" = 'legacy-owner';
UPDATE "imp_batches" SET "userId" = 'legacy-owner';
UPDATE "imp_rows" SET "userId" = 'legacy-owner';
UPDATE "imp_statement_rows" SET "userId" = 'legacy-owner';
UPDATE "imp_statements" SET "userId" = 'legacy-owner';
UPDATE "ntf_notifications" SET "userId" = 'legacy-owner';
UPDATE "aud_context" SET "source" = 'cli' WHERE "id" = 1;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_bud_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "recurringCount" BOOLEAN NOT NULL DEFAULT true,
    "platformsCount" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_bud_settings" ("id", "userId", "platformsCount", "recurringCount", "updatedAt") SELECT "id", 'legacy-owner', "platformsCount", "recurringCount", "updatedAt" FROM "bud_settings";
DROP TABLE "bud_settings";
ALTER TABLE "new_bud_settings" RENAME TO "bud_settings";
CREATE INDEX "bud_settings_userId_idx" ON "bud_settings"("userId");
CREATE UNIQUE INDEX "bud_settings_userId_key" ON "bud_settings"("userId");
CREATE TABLE "new_ntf_settings" (
    "kind" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "telegram" BOOLEAN NOT NULL,
    "web" BOOLEAN NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("userId", "kind")
);
INSERT INTO "new_ntf_settings" ("kind", "userId", "telegram", "updatedAt", "web") SELECT "kind", 'legacy-owner', "telegram", "updatedAt", "web" FROM "ntf_settings";
DROP TABLE "ntf_settings";
ALTER TABLE "new_ntf_settings" RENAME TO "ntf_settings";
CREATE INDEX "ntf_settings_userId_idx" ON "ntf_settings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_email_key" ON "auth_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_googleSub_key" ON "auth_users"("googleSub");

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_telegramChatId_key" ON "auth_users"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_invites_tokenHash_key" ON "auth_invites"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_invites_email_idx" ON "auth_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_tokenHash_key" ON "auth_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_tokens_userId_kind_idx" ON "auth_tokens"("userId", "kind");

-- CreateIndex
CREATE INDEX "auth_attempts_email_createdAt_idx" ON "auth_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "aud_changes_userId_idx" ON "aud_changes"("userId");

-- CreateIndex
CREATE INDEX "bot_expense_drafts_userId_idx" ON "bot_expense_drafts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bot_expense_drafts_userId_channel_chatId_messageId_itemIndex_key" ON "bot_expense_drafts"("userId", "channel", "chatId", "messageId", "itemIndex");

-- CreateIndex
CREATE INDEX "bot_files_userId_idx" ON "bot_files"("userId");

-- CreateIndex
CREATE INDEX "bud_budget_groups_userId_idx" ON "bud_budget_groups"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bud_budget_groups_userId_name_key" ON "bud_budget_groups"("userId", "name");

-- CreateIndex
CREATE INDEX "bud_category_budgets_userId_idx" ON "bud_category_budgets"("userId");

-- CreateIndex
CREATE INDEX "bud_incomes_userId_idx" ON "bud_incomes"("userId");

-- CreateIndex
CREATE INDEX "bud_monthly_budgets_userId_idx" ON "bud_monthly_budgets"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "bud_monthly_budgets_userId_month_year_key" ON "bud_monthly_budgets"("userId", "month", "year");

-- CreateIndex
CREATE INDEX "cat_card_holders_userId_idx" ON "cat_card_holders"("userId");

-- CreateIndex
CREATE INDEX "cat_categories_userId_idx" ON "cat_categories"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cat_categories_userId_name_key" ON "cat_categories"("userId", "name");

-- CreateIndex
CREATE INDEX "cat_payment_methods_userId_idx" ON "cat_payment_methods"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cat_payment_methods_userId_name_key" ON "cat_payment_methods"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "cat_payment_methods_userId_code_key" ON "cat_payment_methods"("userId", "code");

-- CreateIndex
CREATE INDEX "cat_people_userId_idx" ON "cat_people"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cat_people_userId_name_key" ON "cat_people"("userId", "name");

-- CreateIndex
CREATE INDEX "exp_attachments_userId_idx" ON "exp_attachments"("userId");

-- CreateIndex
CREATE INDEX "exp_commitments_userId_idx" ON "exp_commitments"("userId");

-- CreateIndex
CREATE INDEX "exp_contributions_userId_idx" ON "exp_contributions"("userId");

-- CreateIndex
CREATE INDEX "exp_credit_card_expenses_userId_idx" ON "exp_credit_card_expenses"("userId");

-- CreateIndex
CREATE INDEX "exp_daily_expenses_userId_idx" ON "exp_daily_expenses"("userId");

-- CreateIndex
CREATE INDEX "exp_debt_payments_userId_idx" ON "exp_debt_payments"("userId");

-- CreateIndex
CREATE INDEX "exp_debts_userId_idx" ON "exp_debts"("userId");

-- CreateIndex
CREATE INDEX "exp_fixed_costs_userId_idx" ON "exp_fixed_costs"("userId");

-- CreateIndex
CREATE INDEX "exp_recurring_expenses_userId_idx" ON "exp_recurring_expenses"("userId");

-- CreateIndex
CREATE INDEX "exp_subscriptions_userId_idx" ON "exp_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "imp_batches_userId_idx" ON "imp_batches"("userId");

-- CreateIndex
CREATE INDEX "imp_rows_userId_idx" ON "imp_rows"("userId");

-- CreateIndex
CREATE INDEX "imp_statement_rows_userId_idx" ON "imp_statement_rows"("userId");

-- CreateIndex
CREATE INDEX "imp_statements_userId_idx" ON "imp_statements"("userId");

-- CreateIndex
CREATE INDEX "ntf_notifications_userId_idx" ON "ntf_notifications"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ntf_notifications_userId_dedupeKey_key" ON "ntf_notifications"("userId", "dedupeKey");

