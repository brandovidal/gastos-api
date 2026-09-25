-- P14 (D116): titular and additional people of each credit card
CREATE TABLE "cat_card_holders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentMethodId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "last4" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cat_card_holders_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "cat_payment_methods" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cat_card_holders_personId_fkey" FOREIGN KEY ("personId") REFERENCES "cat_people" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "cat_card_holders_paymentMethodId_personId_key" ON "cat_card_holders"("paymentMethodId", "personId");

-- The owner is the titular of every credit card so far; the additional ones are added in Configuración
INSERT INTO "cat_card_holders" ("id", "paymentMethodId", "personId", "role")
SELECT lower(hex(randomblob(12))), "pm"."id", "p"."id", 'titular'
FROM "cat_payment_methods" AS "pm", "cat_people" AS "p"
WHERE "pm"."type" = 'credit_card' AND "p"."isDefault" = 1;
