-- P27 (D99, D100): loans and investments, their contributions and the attachments of any record.
-- Only new tables and one ADD COLUMN: nothing is recreated, so the previous version keeps working (D52).

CREATE TABLE "exp_commitments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subtype" TEXT NOT NULL,
    "entity" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "totalAmount" REAL,
    "installmentCount" INTEGER,
    "installmentAmount" REAL,
    "dueDay" INTEGER,
    "startMonth" INTEGER,
    "startYear" INTEGER,
    "cancellationAmount" REAL,
    "cancellationDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "personId" TEXT NOT NULL,
    "categoryId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_commitments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "exp_commitments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "cat_categories" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "exp_commitments_kind_status_idx" ON "exp_commitments"("kind", "status");

CREATE TABLE "exp_contributions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commitmentId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "quantity" REAL,
    "unit" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "exp_contributions_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "exp_commitments" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "exp_contributions_commitmentId_date_idx" ON "exp_contributions"("commitmentId", "date");

CREATE TABLE "exp_attachments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileId" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exp_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "bot_files" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "exp_attachments_refType_refId_idx" ON "exp_attachments"("refType", "refId");
CREATE INDEX "exp_attachments_fileId_idx" ON "exp_attachments"("fileId");

ALTER TABLE "exp_fixed_costs" ADD COLUMN "commitmentId" TEXT REFERENCES "exp_commitments" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "exp_fixed_costs_commitmentId_idx" ON "exp_fixed_costs"("commitmentId");
