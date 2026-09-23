# gastos-api

NestJS backend for expense intake from chat (Telegram first, WhatsApp later) with AI extraction. Design and pending decisions live in `../docs/plans/2026-09-22-gastos-bot-ai-design.md`. Structure, rules and tests mirror `clemente/mms-ai`.

## Rules

- Everything in code is in **English**: tables, fields, enum values, exception codes, logs and comments. Only the bot's chat replies to the user are in Spanish.
- Never `git commit` or `push` unless explicitly asked.
- New dependencies: let pnpm pick a version allowed by `minimumReleaseAge` (use a range like `^2.0.0`); never add `minimumReleaseAgeExclude`. Packages with install scripts go in `allowBuilds` in `pnpm-workspace.yaml`.
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
pnpm telegram:setup     # register webhook + command menu (needs TELEGRAM_* and PUBLIC_URL in .env.dev)
```

## Structure

```
prisma/schema.prisma        prisma.config.ts
src/
  main.ts · app.ts · app.module.ts
  settings/                 configuration + typed models (settings.model.ts), read with ConfigService
  db/prisma/                PrismaService (libSQL adapter: file: locally, libsql:// on Turso)
  db/models/<entity>/       <entity>DB.repository.ts (+ test) · <entity>DB.module.ts · <entity>DB.dto.ts · <entity>DB.serializer.ts (only with JSON columns)
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
- `ExpenseFile` is every expense received from a chat (text, image or audio). Its open row (`draft` or `awaiting_confirmation`) is the conversation state of that chat; there is no session table. `@@unique([channel, chatId, messageId, itemIndex])` makes webhook retries idempotent (`DuplicateExpenseFileException`).
- `AiRequestLog` stores one row per AI call to count usage against the free daily quota.
- Repositories never leak Prisma errors: map them with `isPrismaError` to `AppException`s.

## AI extraction

- `providers/ai/`: `AiExtractorProviderStrategy` → `GeminiExtractorService` (primary, images) and `GroqExtractorService` (text-only fallback). Providers return raw JSON text; `modules/expense-extraction` validates it.
- Route: text → Gemini Flash-Lite → Groq; image → Gemini Flash-Lite → Gemini Flash. A model is skipped at 90 % of its daily free quota (counted from `AiRequestLog`).
- The AI picks catalog values by short refs (`p1`, `pm2`, `cc1`, `cat3`); `expense-extraction.resolver.ts` maps them to ids and computes `missingFields`. Never send database ids or secrets to the AI.
- Simple corrections go through `correction-parser.ts` first; the AI is only called when it returns `null`.
- Tests never call real APIs: mock `@google/genai` / `openai` with `vi.mock`.

## Conversation and Telegram

- `modules/conversation`: channel-agnostic. `ConversationService.handle(ChannelMessage)` returns `BotReply[]` (+ a `notice` for pressed buttons). Channels only map their updates in and render replies out; user-facing texts (Spanish) live in `conversation.messages.ts`.
- One `ExpenseFile` per expense; one question at a time (`pendingField`); the latest open file is the one text corrections apply to; open files expire after 30 minutes.
- A message is a correction only if it answers the pending question or **starts with a correction keyword** (`monto`, `persona`, `cuota`, `tarjeta`, …; see `correction-parser.ts`). Anything else is a new expense. ✏️ Corregir sends the next message to the AI with the draft.
- Button data: `<action>:<expenseFileId>[:<fieldCode>:<value>]` (`bot-action.codec.ts`), always ≤ 64 bytes (Telegram limit).
- `ExpenseSaverService` creates the record of the destination table and marks the file as saved in one transaction (`ExpenseDBRepository.saveFromExpenseFile`). Credit cards: day ≤ closing day → that month, otherwise the next one.
- `modules/telegram`: the webhook (`POST /v1/telegram/webhook`) checks the secret header, answers 200 at once and processes the update in a per-chat in-memory queue (`KeyedQueue`). Chats outside `TELEGRAM_ALLOWED_CHAT_IDS` get a 200 and are ignored.

## Database (Turso)

Prisma Migrate cannot run against remote Turso. Flow:

1. `pnpm db:migrate:dev --name <name>` creates the migration against local `dev.db` and regenerates the client (Prisma 7 `migrate dev` no longer runs `generate`).
2. `pnpm db:migrate:diff > migration.sql` (or use the generated `prisma/migrations/*/migration.sql`).
3. `turso db shell <db> < migration.sql`.
