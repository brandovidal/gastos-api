// P29 (D122): generates the migration with the history triggers from the columns of the database.
// Usage: make audit-triggers            → writes prisma/migrations/<timestamp>_audit_triggers/ when a table changed
//        make audit-triggers CHECK=yes  → only says whether they are up to date (exit 1 if not)
// Run it after a migration that adds or drops a column of an audited table (AUDITED_TABLES), then `make db-deploy`.
import { createClient } from '@libsql/client'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { AUDIT_ID_COLUMN, AUDITED_TABLES } from '../src/commons/constants/audit.constant'
import {
  auditTriggersMigration,
  AuditedTable,
  buildAuditTriggers,
  normalizeTriggerSql,
} from '../src/db/audit/audit-triggers'

async function main() {
  const check = process.argv.includes('--check')
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL (a database with every migration applied: make db-deploy)')
  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN })

  const tables: AuditedTable[] = []
  for (const table of AUDITED_TABLES) {
    const { rows } = await db.execute(`SELECT name, pk FROM pragma_table_info('${table}') ORDER BY cid`)
    if (!rows.length) throw new Error(`${table} does not exist: run make db-deploy first`)
    const idColumn = AUDIT_ID_COLUMN[table] ?? rows.find((row) => Number(row.pk) === 1)?.name
    if (!idColumn) throw new Error(`${table} has no primary key`)
    tables.push({ table, idColumn: String(idColumn), columns: rows.map((row) => String(row.name)) })
  }

  const expected = buildAuditTriggers(tables)
  const existing = new Map(
    (
      await db.execute("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'aud\\_%' ESCAPE '\\'")
    ).rows.map((row) => [String(row.name), normalizeTriggerSql(String(row.sql))]),
  )
  const stale = expected.filter((trigger) => existing.get(trigger.name) !== normalizeTriggerSql(trigger.sql))
  const extra = [...existing.keys()].filter((name) => !expected.some((trigger) => trigger.name === name))

  if (!stale.length && !extra.length) {
    console.log(`✔ ${expected.length} triggers up to date (${AUDITED_TABLES.length} tables)`)
    return
  }
  console.log(`Out of date: ${stale.length} trigger(s) differ, ${extra.length} left over`)
  stale.slice(0, 10).forEach((trigger) => console.log(`  ${trigger.name}`))
  if (check) process.exit(1)

  // After the last migration, always (the name is the order)
  const migrations = join(__dirname, '..', 'prisma', 'migrations')
  const last = readdirSync(migrations)
    .filter((name) => /^\d{14}_/.test(name))
    .sort()
    .pop()!
    .slice(0, 14)
  const now = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  const stamp = now > last ? now : String(Number(last) + 1)
  const dir = join(migrations, `${stamp}_audit_triggers`)
  mkdirSync(dir)
  writeFileSync(join(dir, 'migration.sql'), auditTriggersMigration(expected))
  extra.forEach((name) => console.log(`  ${name} is not generated any more: drop it by hand in the migration`))
  console.log(`Wrote ${dir}\nNow: make db-deploy`)
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
