-- AlterTable
ALTER TABLE "cat_people" ADD COLUMN "documentNumber" TEXT;

-- CreateTable
CREATE TABLE "imp_statements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentMethodId" TEXT NOT NULL,
    "paymentMonth" INTEGER NOT NULL,
    "paymentYear" INTEGER NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "dueDate" DATETIME,
    "totalDue" REAL,
    "minimumDue" REAL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "source" TEXT NOT NULL,
    "fileId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'review',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "imp_statement_rows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "statementId" TEXT NOT NULL,
    "date" DATETIME,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "installment" TEXT,
    "result" TEXT NOT NULL,
    "expenseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "imp_statement_rows_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "imp_statements" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "imp_statements_paymentMethodId_paymentYear_paymentMonth_idx" ON "imp_statements"("paymentMethodId", "paymentYear", "paymentMonth");

-- CreateIndex
CREATE INDEX "imp_statement_rows_statementId_idx" ON "imp_statement_rows"("statementId");

