import { defineConfig } from 'prisma/config'

// Prisma Migrate runs against a local SQLite file. Turso is updated by applying
// the SQL from `pnpm db:migrate:diff` with `turso db shell` (see CLAUDE.md).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
})
