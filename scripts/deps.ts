// Leaves an environment ready after pulling changes: Prisma client, pending table migrations, catalogs and the
// bot command menu (plus the webhook when PUBLIC_URL is set). Safe to run as many times as needed.
// Usage: pnpm deps       (.env.local, SQLite file:./dev.db)
//        pnpm deps:dev   (.env.dev, Turso)
import { execSync } from 'node:child_process'

type Step = { title: string; command: string; skip?: string }

function steps(): Step[] {
  const url = process.env.DATABASE_URL ?? ''
  const isLocalFile = url.startsWith('file:')

  return [
    // pnpm install does not run it: ignore-scripts=true is global on this machine
    { title: 'Prisma client', command: 'prisma generate' },
    {
      title: 'Table migrations',
      // Prisma Migrate cannot talk to remote Turso: scripts/db-deploy.ts applies the same SQL files there
      command: isLocalFile ? 'prisma migrate deploy' : 'tsx scripts/db-deploy.ts',
    },
    { title: 'Catalogs (seed)', command: 'tsx prisma/seed.ts' },
    {
      title: 'Telegram bot (command menu and webhook)',
      command: 'tsx scripts/telegram-setup.ts --optional-webhook',
      skip: process.env.TELEGRAM_BOT_TOKEN ? undefined : 'TELEGRAM_BOT_TOKEN is not set',
    },
  ]
}

function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Set DATABASE_URL (run through pnpm deps or pnpm deps:dev)')

  console.log(`Database: ${url.split('?')[0]}\n`)

  for (const [index, { title, command, skip }] of steps().entries()) {
    console.log(`▶ ${index + 1}. ${title}`)
    if (skip) {
      console.log(`  skipped: ${skip}\n`)
      continue
    }
    execSync(command, { stdio: 'inherit', env: process.env })
    console.log('')
  }

  console.log('✔ Ready')
}

try {
  main()
} catch (error) {
  console.error(`✖ ${(error as Error).message}`)
  process.exit(1)
}
