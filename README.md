# kogane-api

Backend for [kogane-app](../kogane-app): receives expenses from chat (Telegram, then WhatsApp), extracts them with AI and exposes a REST API.

Stack: NestJS 11 · TypeScript · pnpm · Prisma 7 · Turso (libSQL) · Zod 4 · Vitest.

## Setup

```sh
fnm use            # Node 22 (.node-version)
pnpm install       # also runs prisma generate
cp .env.example .env.local
pnpm db:migrate    # create local dev.db
pnpm db:seed       # load catalogs
pnpm local         # http://localhost:5560/v1/health · Swagger at /docs
```

## Environments

| Env file | Database | Used by |
|---|---|---|
| `.env.local` | local SQLite `file:./dev.db` | `pnpm local`, `db:migrate`, `db:seed`, `db:studio`, `telegram:setup` |
| `.env.dev` | Turso `libsql://…` + `DATABASE_AUTH_TOKEN` | `pnpm dev`, `db:deploy:dev`, `db:seed:dev` |
| `.env.test` | local SQLite `file:./test.db` | integration tests |

Env files are git-ignored; never commit tokens.

## Scripts

| Script | Description |
|---|---|
| `pnpm local` | Start in watch mode with `.env.local` (local SQLite) |
| `pnpm dev` | Start in watch mode with `.env.dev` (Turso) |
| `pnpm build` | Compile to `dist/` |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` / `pnpm test:ci` | Unit tests (watch / single run) |
| `pnpm test:integration` | Integration tests against local SQLite |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate --name <name>` | Create a migration against local SQLite and regenerate the client |
| `pnpm db:migrate:diff` | Print the SQL between migrations and schema |
| `pnpm db:deploy:dev` | Apply pending migrations to Turso (dev); safe to re-run |
| `pnpm db:seed` / `pnpm db:seed:dev` | Load or update catalogs locally / on Turso (people, payment methods, budget groups, categories) |
| `pnpm telegram:setup [url]` | Register the Telegram webhook and command menu |

See [CLAUDE.md](CLAUDE.md) for conventions and the Turso migration flow.
