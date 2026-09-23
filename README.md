# kogane-api

Backend for [kogane-app](../kogane-app): receives expenses from chat (Telegram, then WhatsApp), extracts them with AI and exposes a REST API.

Stack: NestJS 11 · TypeScript · pnpm · Prisma 7 · Turso (libSQL) · Zod 4 · Vitest.

## Setup

```sh
fnm use            # Node 22 (.node-version)
pnpm install       # also runs prisma generate
cp .env.example .env.local
pnpm deps          # Prisma client + pending migrations + catalogs + bot command menu
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
| `pnpm deps` / `pnpm deps:dev` | Leave local / Turso ready after pulling changes: Prisma client, pending table migrations, catalogs, bot command menu (and webhook if `PUBLIC_URL` is set). Safe to re-run |
| `pnpm local` | Start in watch mode with `.env.local` (local SQLite) |
| `pnpm dev` | Start in watch mode with `.env.dev` (Turso) |
| `pnpm build` | Compile to `dist/` |
| `pnpm lint` / `pnpm format` | ESLint / Prettier |
| `pnpm test` / `pnpm test:ci` | Unit tests (watch / single run) |
| `pnpm test:integration` | Integration tests against local SQLite (conversation flows replay recorded AI answers) |
| `pnpm eval:extraction` | Golden set against the **real AI** (~30 calls, not in CI); `:record` saves the answers as fixtures, `:replay` scores them again for free |
| `pnpm db:generate` | Generate the Prisma client |
| `pnpm db:migrate --name <name>` | Create a migration against local SQLite and regenerate the client |
| `pnpm db:migrate:diff` | Print the SQL between migrations and schema |
| `pnpm db:deploy:dev` | Apply pending migrations to Turso (dev); safe to re-run |
| `pnpm db:seed` / `pnpm db:seed:dev` | Load or update catalogs locally / on Turso (people, payment methods, budget groups, categories) |
| `pnpm telegram:setup [url]` | Register the Telegram webhook and command menu |

## Using the bot (@kogane_finanzas_bot)

Write expenses as you would say them; the bot reads them with AI, asks for what is missing and waits for ✅ Guardar.

| You write | Result |
|---|---|
| `almuerzo 25 soles con yape` | Day-to-day expense (Yape, Comida, today) |
| `uber 18.50 ayer` | Asks "¿Con qué pagaste?" with buttons |
| `zapatillas 300 con io en 3 cuotas` | Credit card expense, installment 1/3, billed by the card closing day |
| `netflix 45 mensual con la oh` · `luz 120 con bcp` · `le presté 100 a dany` | Subscription · fixed cost · receivable |
| `monto 30`, `persona dany`, `cuota 2/6`, `ayer`… | Corrects the expense just read (without AI) |
| 📸 A Yape/Plin screenshot or a voucher photo (caption optional, e.g. `persona dany`) | Reads amount, date, receiver and operation number; warns if the same image or operation was already saved |
| 🎙️ A voice note (up to 60 s) | Transcribes it ("🎙️ Entendí: «…»") and reads it like text |

Buttons: ✅ Guardar · ✏️ Corregir · 📥 Bandeja · ❌ Descartar. Commands: `/bandeja` (saved for later and failed, with ↩️ Retomar), `/ultimos`, `/resumen` (month totals), `/uso` (AI quota used today), `/cancelar`, `/ayuda`.

See [CLAUDE.md](CLAUDE.md) for conventions and the Turso migration flow.
