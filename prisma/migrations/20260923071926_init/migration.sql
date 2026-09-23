-- CreateTable
CREATE TABLE "cat_people" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "cat_payment_methods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showInBot" BOOLEAN NOT NULL DEFAULT true,
    "billingCloseDay" INTEGER,
    "paymentDueDay" INTEGER,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "cat_categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "budgetGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cat_categories_budgetGroupId_fkey" FOREIGN KEY ("budgetGroupId") REFERENCES "bud_budget_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bud_budget_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '📦',
    "percentage" REAL NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bud_category_budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "monthlyLimit" REAL NOT NULL,
    "alertThreshold" REAL NOT NULL DEFAULT 80,
    "month" INTEGER,
    "year" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bud_category_budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bud_monthly_budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "salary" REAL NOT NULL,
    "limitPercent" REAL NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "bot_expense_drafts" (
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
    "categoryId" TEXT,
    "confidence" TEXT NOT NULL DEFAULT '{}',
    "missingFields" TEXT NOT NULL DEFAULT '[]',
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bot_expense_drafts_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bot_expense_drafts_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "bot_expense_drafts_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exp_daily_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
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

-- CreateTable
CREATE TABLE "exp_fixed_costs" (
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
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_fixed_costs_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_fixed_costs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_fixed_costs_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_fixed_costs_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exp_subscriptions" (
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
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_subscriptions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_subscriptions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_subscriptions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_subscriptions_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exp_credit_card_expenses" (
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
    "paymentMethodId" TEXT NOT NULL,
    "installment" TEXT,
    "paymentMonth" INTEGER NOT NULL,
    "paymentYear" INTEGER NOT NULL,
    "processDate" DATETIME,
    "notes" TEXT,
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_credit_card_expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_credit_card_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_credit_card_expenses_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_credit_card_expenses_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exp_accounts_receivable" (
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
    "draftId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_accounts_receivable_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_accounts_receivable_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "exp_recurring_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "targetType" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL DEFAULT 'essential',
    "personId" TEXT NOT NULL,
    "categoryId" TEXT,
    "paymentMethodId" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_recurring_expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_recurring_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "exp_recurring_expenses_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ai_request_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "draftId" TEXT,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_request_logs_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "bot_expense_drafts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "cat_people_name_key" ON "cat_people"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cat_payment_methods_name_key" ON "cat_payment_methods"("name");

-- CreateIndex
CREATE UNIQUE INDEX "cat_payment_methods_code_key" ON "cat_payment_methods"("code");

-- CreateIndex
CREATE UNIQUE INDEX "cat_categories_name_key" ON "cat_categories"("name");

-- CreateIndex
CREATE INDEX "cat_categories_budgetGroupId_idx" ON "cat_categories"("budgetGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "bud_budget_groups_name_key" ON "bud_budget_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bud_category_budgets_categoryId_month_year_key" ON "bud_category_budgets"("categoryId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "bud_monthly_budgets_month_year_key" ON "bud_monthly_budgets"("month", "year");

-- CreateIndex
CREATE INDEX "bot_expense_drafts_channel_chatId_status_idx" ON "bot_expense_drafts"("channel", "chatId", "status");

-- CreateIndex
CREATE INDEX "bot_expense_drafts_destination_status_spentAt_idx" ON "bot_expense_drafts"("destination", "status", "spentAt");

-- CreateIndex
CREATE UNIQUE INDEX "bot_expense_drafts_channel_chatId_messageId_itemIndex_key" ON "bot_expense_drafts"("channel", "chatId", "messageId", "itemIndex");

-- CreateIndex
CREATE UNIQUE INDEX "exp_daily_expenses_draftId_key" ON "exp_daily_expenses"("draftId");

-- CreateIndex
CREATE INDEX "exp_daily_expenses_spentAt_idx" ON "exp_daily_expenses"("spentAt");

-- CreateIndex
CREATE INDEX "exp_daily_expenses_personId_idx" ON "exp_daily_expenses"("personId");

-- CreateIndex
CREATE INDEX "exp_daily_expenses_categoryId_idx" ON "exp_daily_expenses"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "exp_fixed_costs_draftId_key" ON "exp_fixed_costs"("draftId");

-- CreateIndex
CREATE INDEX "exp_fixed_costs_paymentMonth_paymentYear_idx" ON "exp_fixed_costs"("paymentMonth", "paymentYear");

-- CreateIndex
CREATE INDEX "exp_fixed_costs_categoryId_idx" ON "exp_fixed_costs"("categoryId");

-- CreateIndex
CREATE INDEX "exp_fixed_costs_personId_idx" ON "exp_fixed_costs"("personId");

-- CreateIndex
CREATE INDEX "exp_fixed_costs_paymentStatus_idx" ON "exp_fixed_costs"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "exp_subscriptions_draftId_key" ON "exp_subscriptions"("draftId");

-- CreateIndex
CREATE INDEX "exp_subscriptions_paymentMonth_paymentYear_idx" ON "exp_subscriptions"("paymentMonth", "paymentYear");

-- CreateIndex
CREATE INDEX "exp_subscriptions_personId_idx" ON "exp_subscriptions"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "exp_credit_card_expenses_draftId_key" ON "exp_credit_card_expenses"("draftId");

-- CreateIndex
CREATE INDEX "exp_credit_card_expenses_paymentMethodId_paymentMonth_paymentYear_idx" ON "exp_credit_card_expenses"("paymentMethodId", "paymentMonth", "paymentYear");

-- CreateIndex
CREATE INDEX "exp_credit_card_expenses_personId_idx" ON "exp_credit_card_expenses"("personId");

-- CreateIndex
CREATE INDEX "exp_credit_card_expenses_paymentStatus_idx" ON "exp_credit_card_expenses"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "exp_accounts_receivable_draftId_key" ON "exp_accounts_receivable"("draftId");

-- CreateIndex
CREATE INDEX "exp_accounts_receivable_status_idx" ON "exp_accounts_receivable"("status");

-- CreateIndex
CREATE INDEX "exp_accounts_receivable_personId_idx" ON "exp_accounts_receivable"("personId");

-- CreateIndex
CREATE INDEX "ai_request_logs_provider_model_createdAt_idx" ON "ai_request_logs"("provider", "model", "createdAt");
