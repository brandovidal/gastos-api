-- P14 (D116): the cobro created with the expense of another person's purchase
ALTER TABLE "imp_statement_rows" ADD COLUMN "debtId" TEXT;
