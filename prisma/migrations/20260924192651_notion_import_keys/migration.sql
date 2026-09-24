-- AlterTable
ALTER TABLE "exp_credit_card_expenses" ADD COLUMN "importKey" TEXT;

-- AlterTable
ALTER TABLE "exp_debts" ADD COLUMN "importKey" TEXT;

-- AlterTable
ALTER TABLE "exp_fixed_costs" ADD COLUMN "importKey" TEXT;

-- AlterTable
ALTER TABLE "exp_subscriptions" ADD COLUMN "importKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "exp_credit_card_expenses_importKey_key" ON "exp_credit_card_expenses"("importKey");

-- CreateIndex
CREATE UNIQUE INDEX "exp_debts_importKey_key" ON "exp_debts"("importKey");

-- CreateIndex
CREATE UNIQUE INDEX "exp_fixed_costs_importKey_key" ON "exp_fixed_costs"("importKey");

-- CreateIndex
CREATE UNIQUE INDEX "exp_subscriptions_importKey_key" ON "exp_subscriptions"("importKey");

