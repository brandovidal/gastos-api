# gastos-api

NestJS backend for expense intake from chat (Telegram first, WhatsApp later) with AI extraction. Design and pending decisions live in `../docs/plans/2026-09-22-gastos-bot-ai-design.md`. Structure, rules and tests mirror `clemente/mms-ai`.

## Rules

- Everything in code is in **English**: tables, fields, enum values, exception codes, logs and comments. Only the bot's chat replies to the user are in Spanish.
- Never `git commit` or `push` unless explicitly asked.
- Node 22 (`.node-version`), pnpm, NestJS 11 (`nestjs-zod` does not support Nest 12 yet), Prisma 7, Zod 4.
- Personal, single-user app: prefer the simplest thing (no Redis, queues or multi-tenant).

## Commands

```sh
pnpm dev                # watch mode with .env.dev
pnpm build
pnpm lint / pnpm format
pnpm test               # unit (watch)
pnpm test:ci            # unit (single run)
pnpm test:integration   # against local SQLite (.env.test)
pnpm db:generate        # Prisma client -> src/generated/prisma (git-ignored)
```

## Structure

```
prisma/schema.prisma        prisma.config.ts
src/
  main.ts · app.ts · app.module.ts
  settings/                 configuration + typed models (settings.model.ts), read with ConfigService
  db/prisma/                PrismaService (libSQL adapter: file: locally, libsql:// on Turso)
  providers/                external clients: logger (pino), ai/<provider>, telegram
  modules/<feature>/        controllers, services, dto, validations, mocks
  commons/                  constants · decorators · exceptions/<domain> · guards · helpers · serializers · types
```

### Module anatomy (as `mms-ai/src/modules/audio`)

```
modules/<feature>/
  <feature>.module.ts
  <feature>.controller.ts   + <feature>.controller.test.ts
  <feature>.service.ts      + <feature>.service.test.ts
  validations/<feature>.validation.ts     Zod schemas
  dto/request/*.dto.ts · dto/response/*.dto.ts   createZodDto(schema)
  mocks/dto/*.mock.ts · mocks/exception/*.mock.ts
```

- Exceptions extend `AppException` with their own code: `commons/exceptions/<domain>/<name>.exception.ts` (e.g. `API_KEY_REQUIRED`).
- Successful responses are wrapped by `ResponseInterceptor`; set the code and message with `@ResponseMessage('CODE', 'Message')`.
- REST endpoints for gastos-app use `@UseGuards(ApiKeyGuard)` (header `x-api-key`).
- Routes are versioned by URI with default version `1` (`VERSIONING_OPTIONS`): `@Controller('health')` is served at `/v1/health`. Use `@Version('2')` only for breaking changes. Swagger stays at `/docs`.

## Tests

- Vitest projects in `vitest.config.mts`: `unit` (`src/**/*.test.ts`) and `integration` (`src/**/*integration-test.ts`).
- Tests live next to the code. Use `@nestjs/testing` and mock dependencies with `vi.fn()` via `{ provide, useValue }`.
- Integration tests run against a local SQLite file (`file:./test.db`), same engine as Turso. `test/integration.setup.ts` recreates it and applies all migrations before each run.

## Data model

- Enum-like columns are strings (SQLite has no enums); validate them with `commons/constants/expense.constant.ts` and `catalog.constant.ts`.
- `aliases` in `Person` and `PaymentMethod` is a JSON array stored as a string.
- Installments use the `n/m` format (`INSTALLMENT_REGEX`).

## Database (Turso)

Prisma Migrate cannot run against remote Turso. Flow:

1. `pnpm db:migrate:dev --name <name>` creates the migration against local `dev.db` and regenerates the client (Prisma 7 `migrate dev` no longer runs `generate`).
2. `pnpm db:migrate:diff > migration.sql` (or use the generated `prisma/migrations/*/migration.sql`).
3. `turso db shell <db> < migration.sql`.
