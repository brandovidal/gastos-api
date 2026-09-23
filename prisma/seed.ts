// Loads the catalogs the bot needs (people, cards, payment methods, budget groups, categories).
// Usage: pnpm db:seed   (uses DATABASE_URL / DATABASE_AUTH_TOKEN from .env.dev; works for local SQLite and Turso)
import { PrismaLibSql } from '@prisma/adapter-libsql'

import { PrismaClient } from '../src/generated/prisma/client'
import { seedCatalogs } from '../src/db/seed/catalog.seed'

async function main() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error('Set DATABASE_URL (e.g. file:./dev.db) in .env.dev')
  }

  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN }),
  })

  try {
    const result = await seedCatalogs(prisma)
    console.log(`Seeded on ${url.split('?')[0]}:`, result)

    const owner = await prisma.person.findFirst({ where: { isDefault: true } })
    console.log(`Default person: ${owner?.name ?? 'none'}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
