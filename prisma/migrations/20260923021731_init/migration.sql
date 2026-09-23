-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "aliases" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "creditCardId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payment_methods_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "credit_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "billingCloseDay" INTEGER NOT NULL,
    "paymentDueDay" INTEGER NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "budget_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '📦',
    "percentage" REAL NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "icon" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "budgetGroupId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "categories_budgetGroupId_fkey" FOREIGN KEY ("budgetGroupId") REFERENCES "budget_groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "category_budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT NOT NULL,
    "monthlyLimit" REAL NOT NULL,
    "alertThreshold" REAL NOT NULL DEFAULT 80,
    "month" INTEGER,
    "year" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "category_budgets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "monthly_budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "salary" REAL NOT NULL,
    "limitPercent" REAL NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "fixed_costs" (
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
    "intakeItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "fixed_costs_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fixed_costs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fixed_costs_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "subscriptions" (
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
    "intakeItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "subscriptions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "credit_card_expenses" (
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
    "intakeItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "credit_card_expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "credit_card_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "credit_card_expenses_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "accounts_receivable" (
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
    "intakeItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "accounts_receivable_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "targetType" TEXT NOT NULL,
    "expenseType" TEXT NOT NULL DEFAULT 'essential',
    "personId" TEXT NOT NULL,
    "categoryId" TEXT,
    "paymentMethodId" TEXT,
    "creditCardId" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastGeneratedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "recurring_expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recurring_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recurring_expenses_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recurring_expenses_creditCardId_fkey" FOREIGN KEY ("creditCardId") REFERENCES "credit_cards" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "people_name_key" ON "people"("name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_name_key" ON "payment_methods"("name");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_creditCardId_key" ON "payment_methods"("creditCardId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_cards_code_key" ON "credit_cards"("code");

-- CreateIndex
CREATE UNIQUE INDEX "budget_groups_name_key" ON "budget_groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "categories_budgetGroupId_idx" ON "categories"("budgetGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "category_budgets_categoryId_month_year_key" ON "category_budgets"("categoryId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_budgets_month_year_key" ON "monthly_budgets"("month", "year");

-- CreateIndex
CREATE INDEX "fixed_costs_paymentMonth_paymentYear_idx" ON "fixed_costs"("paymentMonth", "paymentYear");

-- CreateIndex
CREATE INDEX "fixed_costs_categoryId_idx" ON "fixed_costs"("categoryId");

-- CreateIndex
CREATE INDEX "fixed_costs_personId_idx" ON "fixed_costs"("personId");

-- CreateIndex
CREATE INDEX "fixed_costs_paymentStatus_idx" ON "fixed_costs"("paymentStatus");

-- CreateIndex
CREATE INDEX "subscriptions_paymentMonth_paymentYear_idx" ON "subscriptions"("paymentMonth", "paymentYear");

-- CreateIndex
CREATE INDEX "subscriptions_personId_idx" ON "subscriptions"("personId");

-- CreateIndex
CREATE INDEX "credit_card_expenses_creditCardId_paymentMonth_paymentYear_idx" ON "credit_card_expenses"("creditCardId", "paymentMonth", "paymentYear");

-- CreateIndex
CREATE INDEX "credit_card_expenses_personId_idx" ON "credit_card_expenses"("personId");

-- CreateIndex
CREATE INDEX "credit_card_expenses_paymentStatus_idx" ON "credit_card_expenses"("paymentStatus");

-- CreateIndex
CREATE INDEX "accounts_receivable_status_idx" ON "accounts_receivable"("status");

-- CreateIndex
CREATE INDEX "accounts_receivable_personId_idx" ON "accounts_receivable"("personId");
