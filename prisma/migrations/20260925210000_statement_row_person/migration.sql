-- P14 (D113): who made each purchase of a statement (a card can be used by several people); null = the statement's
ALTER TABLE "imp_statement_rows" ADD COLUMN "personId" TEXT;
