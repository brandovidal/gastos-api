// Loads the catalogs the bot needs (people, cards, payment methods, budget groups, categories).
// Usage: make seed [ENV=prod]   (DATABASE_URL / DATABASE_AUTH_TOKEN from the env file or CI secrets; SQLite and Turso)
import { PrismaLibSql } from '@prisma/adapter-libsql'

import { PrismaClient } from '../src/generated/prisma/client'
import { AuditSource } from '../src/commons/constants/audit.constant'
import { setAuditContext } from '../src/db/audit/audit-context'
import { LEGACY_OWNER_ID } from '../src/commons/constants/auth.constant'
import { seedCatalogs } from '../src/db/seed/catalog.seed'

async function main() {
  const url = process.env.DATABASE_URL

  if (!url) {
    throw new Error('Set DATABASE_URL (e.g. file:./dev.db) in .env.dev or .env.prod')
  }

  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({ url, authToken: process.env.DATABASE_AUTH_TOKEN }),
  })

  try {
    await setAuditContext(prisma, AuditSource.CLI) // the history says these changes came from a script
    // The people and cards of the seed are the owner's (P23); SEED_USER_EMAIL seeds them for another user
    const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase()
    const owner = await prisma.authUser.findUnique({ where: email ? { email } : { id: LEGACY_OWNER_ID } })
    if (!owner)
      throw new Error(
        email ? `No user with the email ${email}` : 'The owner user does not exist: run make db-deploy first',
      )
    const result = await seedCatalogs(prisma, owner.id)
    console.log(`Seeded on ${url.split('?')[0]}:`, result)

    const person = await prisma.person.findFirst({ where: { userId: owner.id, isDefault: true } })
    console.log(`Default person of ${owner.email}: ${person?.name ?? 'none'}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: Error) => {
  console.error(error.message)
  process.exit(1)
})
