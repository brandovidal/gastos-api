# gastos-api

Backend for [gastos-app](../gastos-app): receives expenses from chat (Telegram, then WhatsApp), extracts them with AI and exposes a REST API.

Stack: NestJS 11 · TypeScript · pnpm · Prisma 7 · Turso (libSQL) · Zod 4 · Vitest.

## Setup

```sh
fnm use            # Node 22 (.node-version)
pnpm install       # also runs prisma generate
cp .env.example .env.dev
pnpm dev           # http://localhost:5560/v1/health · Swagger at /docs
```

## Scripts

| Script | Description |
|---|---|
| `pnpm dev` | Start in watch mode with `.env.dev` |
| `pnpm build` | Compile to `dist/` |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` / `pnpm test:ci` | Unit tests (watch / single run) |
| `pnpm test:integration` | Integration tests against local SQLite |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate:dev` | Create a migration against local SQLite |
| `pnpm db:migrate:diff` | Print SQL to apply on Turso |

See [CLAUDE.md](CLAUDE.md) for conventions and the Turso migration flow.
