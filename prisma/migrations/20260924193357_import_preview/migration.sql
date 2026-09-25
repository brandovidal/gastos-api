-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_imp_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'notion',
    "sourceDir" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "files" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '{}',
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_imp_batches" ("created", "createdAt", "files", "id", "source", "sourceDir", "unchanged", "updated") SELECT "created", "createdAt", "files", "id", "source", "sourceDir", "unchanged", "updated" FROM "imp_batches";
DROP TABLE "imp_batches";
ALTER TABLE "new_imp_batches" RENAME TO "imp_batches";
-- Batches that existed were applied by make import-notion
UPDATE "imp_batches" SET "status" = 'applied', "appliedAt" = "createdAt";
CREATE INDEX "imp_batches_status_idx" ON "imp_batches"("status");
CREATE TABLE "new_imp_rows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'notion',
    "importKey" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'expense',
    "status" TEXT NOT NULL DEFAULT 'new',
    "message" TEXT,
    "file" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "base" TEXT,
    "targetTable" TEXT,
    "targetId" TEXT,
    "destination" TEXT,
    "description" TEXT,
    "amount" REAL,
    "currency" TEXT,
    "month" INTEGER,
    "year" INTEGER,
    "data" TEXT NOT NULL DEFAULT '{}',
    "paidAt" DATETIME,
    "raw" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "imp_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "imp_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_imp_rows" ("base", "batchId", "createdAt", "file", "id", "importKey", "line", "raw", "source", "targetId", "targetTable", "updatedAt") SELECT "base", "batchId", "createdAt", "file", "id", "importKey", "line", "raw", "source", "targetId", "targetTable", "updatedAt" FROM "imp_rows";
DROP TABLE "imp_rows";
ALTER TABLE "new_imp_rows" RENAME TO "imp_rows";
CREATE INDEX "imp_rows_batchId_kind_status_idx" ON "imp_rows"("batchId", "kind", "status");
CREATE INDEX "imp_rows_importKey_idx" ON "imp_rows"("importKey");
CREATE INDEX "imp_rows_targetTable_targetId_idx" ON "imp_rows"("targetTable", "targetId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

