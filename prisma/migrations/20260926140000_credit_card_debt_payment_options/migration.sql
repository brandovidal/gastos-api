-- Special debt payment options are configured by credit card. Only IO has them enabled initially.
ALTER TABLE "cat_payment_methods" ADD COLUMN "supportsAmortization" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "cat_payment_methods" ADD COLUMN "supportsCashback" BOOLEAN NOT NULL DEFAULT false;

UPDATE "cat_payment_methods"
SET "supportsAmortization" = true, "supportsCashback" = true
WHERE "type" = 'credit_card' AND upper(coalesce("code", "name")) = 'IO';
