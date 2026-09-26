ALTER TABLE "imp_statements" ADD COLUMN "previous_balance" REAL;
ALTER TABLE "imp_statements" ADD COLUMN "previous_payments" REAL;
ALTER TABLE "imp_statements" ADD COLUMN "monthly_payment" REAL;
ALTER TABLE "imp_statement_rows" ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false;
