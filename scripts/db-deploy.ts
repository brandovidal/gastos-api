// Applies pending Prisma migrations to a remote libSQL database (Turso), where `prisma migrate deploy` cannot run.
// Usage: make db-deploy ENV=prod   (make deps runs it too; on SQLite make uses prisma migrate deploy instead)
// Migrations are the SQL files generated locally by `make migrate NAME=<name>` (prisma/migrations/*/migration.sql),
// applied in name order. Applied ones are recorded in `_app_migrations`, so running it twice is safe.
import { Client, createClient } from '@libsql/client'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations')

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL (and DATABASE_AUTH_TOKEN for Turso)')

  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN })

  await db.execute(
    'CREATE TABLE IF NOT EXISTS _app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  )
  const applied = new Set((await db.execute('SELECT name FROM _app_migrations')).rows.map((row) => String(row.name)))

  const pending = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !applied.has(entry.name))
    .map((entry) => entry.name)
    .sort()

  console.log(`Database: ${url.split('?')[0]}`)
  if (!pending.length) {
    console.log('No pending migrations.')
    return
  }

  for (const name of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8')
    // One transaction per migration (statements + record). migrate() turns foreign keys off *outside* the
    // transaction: Prisma rebuilds SQLite tables (create new, copy, drop old, rename) and with foreign keys on,
    // dropping the old table would run ON DELETE SET NULL on every row that points to it (e.g. expenses → drafts).
    // Its PRAGMA foreign_keys=OFF line is ignored inside a transaction, so it is skipped here.
    await db.migrate([
      ...splitStatements(sql)
        .filter((statement) => !/^PRAGMA\s+foreign_keys\s*=/i.test(statement))
        .map((statement) => ({ sql: statement, args: [] })),
      { sql: 'INSERT INTO _app_migrations (name) VALUES (?)', args: [name] },
    ])
    await assertForeignKeys(db, name)
    console.log(`Applied ${name}`)
  }
}

// The rebuilt tables must still satisfy every foreign key
async function assertForeignKeys(db: Client, migration: string) {
  const { rows } = await db.execute('PRAGMA foreign_key_check')
  if (rows.length) {
    throw new Error(`${migration} left ${rows.length} broken foreign key(s): ${JSON.stringify(rows.slice(0, 5))}`)
  }
}

// Prisma's SQLite migrations are plain statements separated by ";" at the end of a line
function splitStatements(sql: string): string[] {
  return sql
    .split(/;\s*$/m)
    .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean)
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
