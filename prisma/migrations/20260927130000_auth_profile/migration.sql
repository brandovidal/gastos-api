-- AlterTable
ALTER TABLE "auth_sessions" ADD COLUMN "impersonatedById" TEXT;

-- AlterTable
ALTER TABLE "auth_users" ADD COLUMN "documentNumber" TEXT;
ALTER TABLE "auth_users" ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "auth_users_phone_key" ON "auth_users"("phone");

