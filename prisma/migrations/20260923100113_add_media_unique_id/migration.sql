-- AlterTable
ALTER TABLE "bot_expense_drafts" ADD COLUMN "mediaUniqueId" TEXT;

-- CreateIndex
CREATE INDEX "bot_expense_drafts_channel_chatId_mediaUniqueId_idx" ON "bot_expense_drafts"("channel", "chatId", "mediaUniqueId");
