// Empties every table of the dev database, to start again from clean data (then `make seed` loads the catalogs).
// Usage: make db-reset [CONFIRM=yes]   (only ENV=dev: production is refused here and in the Makefile)
// The schema and the migration history stay; so do the files in R2 (the dev lifecycle rule expires the temporary ones).
import { createClient } from '@libsql/client'
import Redis from 'ioredis'

// Prisma and db-deploy bookkeeping: emptying them would make the next deploy re-run every migration
// aud_context is the row the history triggers read: without it they would write nothing
const KEEP = new Set(['_prisma_migrations', '_app_migrations', 'aud_context'])

async function main() {
  const env = process.argv[2]
  const url = process.env.DATABASE_URL
  if (env !== 'dev' || process.env.NODE_ENV === 'production') {
    throw new Error(`db-reset only runs on ENV=dev (got ${env ?? 'nothing'}): production data is never emptied`)
  }
  if (!url) throw new Error('Set DATABASE_URL in .env.dev')

  const db = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN })
  const tables = (
    await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  ).rows
    .map((row) => String(row.name))
    .filter((name) => !KEEP.has(name))

  const counts = await Promise.all(
    tables.map(
      async (name) => [name, Number((await db.execute(`SELECT COUNT(*) AS n FROM "${name}"`)).rows[0].n)] as const,
    ),
  )
  // migrate() turns foreign keys off outside its transaction, so the order of the deletes does not matter. The history
  // goes last: the triggers write to it with every delete of the others
  const ordered = [
    ...tables.filter((name) => name !== 'aud_changes'),
    ...tables.filter((name) => name === 'aud_changes'),
  ]
  await db.migrate(ordered.map((name) => ({ sql: `DELETE FROM "${name}"`, args: [] })))
  const { rows: broken } = await db.execute('PRAGMA foreign_key_check')
  if (broken.length)
    throw new Error(`${broken.length} broken foreign key(s) left: ${JSON.stringify(broken.slice(0, 5))}`)

  console.log(`Database: ${url.split('?')[0]}`)
  counts
    .filter(([, count]) => count > 0)
    .forEach(([name, count]) => console.log(`  ${name.padEnd(28)} ${count} rows deleted`))
  console.log(`✔ ${tables.length} tables emptied (${counts.reduce((sum, [, count]) => sum + count, 0)} rows)`)

  await clearNotificationCache()
}

// The bell and the upcoming list live in Redis (P20): without their rows they would show notices that no longer exist
async function clearNotificationCache() {
  if (!process.env.REDIS_URL) return
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  try {
    await redis.connect()
    const keys: string[] = []
    let cursor = '0'
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'ntf:*', 'COUNT', 200)
      cursor = next
      keys.push(...batch)
    } while (cursor !== '0')
    if (keys.length) await redis.del(...keys)
    console.log(`✔ Redis: ${keys.length} notification keys cleared`)
  } catch (error) {
    console.log(`Redis not reachable (${(error as Error).message}): the lists rebuild themselves from the database`)
  } finally {
    redis.disconnect()
  }
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
