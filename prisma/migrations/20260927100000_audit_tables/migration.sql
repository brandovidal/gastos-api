-- CreateTable
CREATE TABLE "aud_changes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "batchId" TEXT,
    "createdAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "aud_context" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'cli',
    "actorId" TEXT,
    "batchId" TEXT
);

-- CreateIndex
CREATE INDEX "aud_changes_entity_entityId_idx" ON "aud_changes"("entity", "entityId");

-- CreateIndex
CREATE INDEX "aud_changes_createdAt_idx" ON "aud_changes"("createdAt");

-- The one row the triggers read
INSERT INTO "aud_context" ("id", "source") VALUES (1, 'cli');
