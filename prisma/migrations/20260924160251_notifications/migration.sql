-- CreateTable
CREATE TABLE "ntf_notifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "amount" REAL,
    "refType" TEXT,
    "refId" TEXT,
    "eventDate" DATETIME,
    "dedupeKey" TEXT NOT NULL,
    "readAt" DATETIME,
    "telegramChatId" TEXT,
    "telegramMessageId" TEXT,
    "telegramSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ntf_settings" (
    "kind" TEXT NOT NULL PRIMARY KEY,
    "telegram" BOOLEAN NOT NULL,
    "web" BOOLEAN NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ntf_notifications_dedupeKey_key" ON "ntf_notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "ntf_notifications_readAt_idx" ON "ntf_notifications"("readAt");

-- CreateIndex
CREATE INDEX "ntf_notifications_kind_createdAt_idx" ON "ntf_notifications"("kind", "createdAt");
