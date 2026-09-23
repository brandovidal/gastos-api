// Applies pending Prisma migrations to a remote libSQL database (Turso), where `prisma migrate deploy` cannot run.
// Usage: pnpm db:deploy:dev   (or `dotenv -e <env file> -- pnpm db:deploy`)
// Migrations are the SQL files generated locally by `pnpm db:migrate` (prisma/migrations/*/migration.sql),
// applied in name order. Applied ones are recorded in `_app_migrations`, so running it twice is safe.
import { createClient } from '@libsql/client'
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
    // One batch per migration: its statements and the record are applied together
    await db.batch(
      [
        ...splitStatements(sql).map((statement) => ({ sql: statement, args: [] })),
        { sql: 'INSERT INTO _app_migrations (name) VALUES (?)', args: [name] },
      ],
      'write',
    )
    console.log(`Applied ${name}`)
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
