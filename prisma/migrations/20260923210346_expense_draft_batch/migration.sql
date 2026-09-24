-- AlterTable
ALTER TABLE "bot_expense_drafts" ADD COLUMN "batchId" TEXT;

-- CreateIndex
CREATE INDEX "bot_expense_drafts_batchId_idx" ON "bot_expense_drafts"("batchId");
