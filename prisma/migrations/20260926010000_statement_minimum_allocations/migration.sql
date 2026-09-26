-- D: save the proposed contribution per person to cover the statement's minimum payment
ALTER TABLE "imp_statements" ADD COLUMN "minimumAllocations" TEXT;
