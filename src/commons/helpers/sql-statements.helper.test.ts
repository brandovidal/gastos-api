import { splitSqlStatements } from './sql-statements.helper'

describe('splitSqlStatements', () => {
  it('should split plain statements at the ";" that ends a line and drop the comments', () => {
    const sql =
      '-- CreateTable\nCREATE TABLE "a" (\n  "id" TEXT NOT NULL PRIMARY KEY\n);\n\n-- CreateIndex\nCREATE INDEX "i" ON "a"("id");\n'

    expect(splitSqlStatements(sql)).toEqual([
      'CREATE TABLE "a" (\n  "id" TEXT NOT NULL PRIMARY KEY\n)',
      'CREATE INDEX "i" ON "a"("id")',
    ])
  })

  it('should keep a whole trigger, with its inner ";", as one statement', () => {
    const sql = [
      'DROP TRIGGER IF EXISTS "t";',
      'CREATE TRIGGER "t" AFTER INSERT ON "a"',
      'BEGIN',
      '  INSERT INTO "log" ("x") VALUES (1);',
      '  UPDATE "log" SET "x" = 2;',
      'END;',
      'CREATE INDEX "i" ON "a"("id");',
    ].join('\n')

    const statements = splitSqlStatements(sql)

    expect(statements).toHaveLength(3)
    expect(statements[1]).toBe(
      'CREATE TRIGGER "t" AFTER INSERT ON "a"\nBEGIN\n  INSERT INTO "log" ("x") VALUES (1);\n  UPDATE "log" SET "x" = 2;\nEND',
    )
    expect(statements[2]).toBe('CREATE INDEX "i" ON "a"("id")')
  })
})
