import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'

// Fresh local SQLite for each integration run, with all migrations applied
export default function setup() {
  const url = process.env.DATABASE_URL ?? 'file:./test.db'

  if (url.startsWith('file:')) {
    rmSync(url.replace('file:', ''), { force: true })
  }

  execSync('pnpm prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' })
}
