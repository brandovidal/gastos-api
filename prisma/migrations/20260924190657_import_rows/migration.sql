-- CreateTable
CREATE TABLE "imp_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'notion',
    "sourceDir" TEXT NOT NULL,
    "files" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "unchanged" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "imp_rows" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'notion',
    "importKey" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "base" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "raw" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "imp_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "imp_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "imp_rows_importKey_key" ON "imp_rows"("importKey");

-- CreateIndex
CREATE INDEX "imp_rows_targetTable_targetId_idx" ON "imp_rows"("targetTable", "targetId");

