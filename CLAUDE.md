# kogane-api

NestJS backend for expense intake from chat (Telegram first, WhatsApp later) with AI extraction. Design and pending decisions live in `../docs/plans/2026-09-22-gastos-bot-ai-design.md`. Structure, rules and tests mirror `clemente/mms-ai`.

## Rules

- Everything in code is in **English**: tables, fields, enum values, exception codes, logs and comments. Only the bot's chat replies to the user are in Spanish.
- Never `git commit` or `push` unless explicitly asked.
- New dependencies: let pnpm pick a version allowed by `minimumReleaseAge` (use a range like `^2.0.0`); never add `minimumReleaseAgeExclude`. Packages with install scripts go in `allowBuilds` in `pnpm-workspace.yaml`.
- Node 22 (`.node-version`), pnpm, NestJS 11 (`nestjs-zod` does not support Nest 12 yet), Prisma 7, Zod 4.
- Personal, single-user app: prefer the simplest thing (no Redis, queues or multi-tenant).

## Commands

```sh
pnpm deps               # after pulling: Prisma client + pending migrations + seed + bot menu (.env.local); deps:dev on Turso
pnpm local              # watch mode with .env.local (SQLite file:./dev.db)
pnpm dev                # watch mode with .env.dev (Turso)
pnpm build
pnpm lint / pnpm format
pnpm test               # unit (watch)
pnpm test:ci            # unit (single run)
pnpm test:integration   # against local SQLite (.env.test)
pnpm eval:extraction    # golden set with the REAL AI (not in CI); :record saves fixtures, :replay rescoring for free
pnpm db:generate        # Prisma client -> src/generated/prisma (git-ignored)
pnpm db:migrate --name <name>   # new migration on local dev.db + prisma generate
pnpm db:deploy:dev      # apply pending migrations to Turso (dev)
pnpm db:seed            # upsert catalogs locally (people, payment methods, budget groups, categories); safe to re-run
pnpm db:seed:dev        # same on Turso (dev)
pnpm telegram:setup     # register webhook + command menu (needs TELEGRAM_* and PUBLIC_URL in .env.local)
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
- REST endpoints for kogane-app use `@UseGuards(ApiKeyGuard)` (header `x-api-key`).
- Swagger (`/docs`, JSON at `/docs-json`): every endpoint has `@ApiTags`, `@ApiOperation` and `@ApiOkResponse` with a response DTO built with `successResponseSchema(schema)` (`commons/helpers/api-response.helper.ts`), the envelope added by `ResponseInterceptor`. `app.routes.test.ts` fails if a route is missing from the document.
- Routes are versioned by URI with default version `1` (`VERSIONING_OPTIONS`): `@Controller('health')` is served at `/v1/health`. Use `@Version('2')` only for breaking changes. Swagger stays at `/docs`.

## Tests

- Vitest projects in `vitest.config.mts`: `unit` (`src/**/*.test.ts`) and `integration` (`src/**/*integration-test.ts`).
- Tests live next to the code. Use `@nestjs/testing` and mock dependencies with `vi.fn()` via `{ provide, useValue }`.
- Integration tests run against a local SQLite file (`file:./test.db`), same engine as Turso. `test/integration.setup.ts` recreates it and applies all migrations before each run.

## Data model

- Enum-like columns are strings (SQLite has no enums); validate them with `commons/constants/expense.constant.ts` and `catalog.constant.ts`.
- `aliases` in `Person` and `PaymentMethod` is a JSON array stored as a string.
- Installments use the `n/m` format (`INSTALLMENT_REGEX`).
- Catalogs live in `src/db/seed/catalog.seed.data.ts` (from the Notion boards). Edit that file and run `pnpm db:seed` to add people, aliases, cards or categories; exactly one person should have `isDefault`.
- Table names carry a prefix by use (`cat_`, `bud_`, `exp_`, `bot_`, `ai_`, `imp_`) through `@@map`; model names do not.
- `ExpenseDraft` (`bot_expense_drafts`) is every expense received from a chat while the bot works on it. Its open row (`draft` or `awaiting_confirmation`) is the conversation state of that chat; there is no session table. `@@unique([channel, chatId, messageId, itemIndex])` makes webhook retries idempotent (`DuplicateExpenseDraftException`). Saving a draft creates the record of its destination table, linked by `draftId`.
- `DailyExpense` (`exp_daily_expenses`) holds only confirmed day-to-day expenses ("gastos sin culpa").
- Credit cards are `PaymentMethod` rows of type `credit_card` (with `code` and billing days); there is no card table. `showInBot` decides the quick replies. The payment method decides daily vs credit card (`applyPaymentMethodRule`).
- `AiRequestLog` stores one row per AI call to count usage against the free daily quota.
- Repositories never leak Prisma errors: map them with `isPrismaError` to `AppException`s.

## AI extraction

- `providers/ai/`: `AiExtractorProviderStrategy` → `GeminiExtractorService` (primary, images) and `GroqExtractorService` (text-only fallback). Providers return raw JSON text; `modules/expense-extraction` validates it.
- Route: text → Gemini Flash-Lite → Groq; image → Gemini Flash-Lite → Gemini Flash. A model is skipped at 90 % of its daily free quota (counted from `AiRequestLog`).
- The AI picks catalog values by short refs (`p1`, `pm2`, `cc1`, `cat3`); `expense-extraction.resolver.ts` maps them to ids and computes `missingFields`. Never send database ids or secrets to the AI.
- Simple corrections go through `correction-parser.ts` first; the AI is only called when it returns `null`.
- Images (P4): a photo or `image/*` file becomes `ChannelMessageType.IMAGE`; the draft keeps `mediaFileId` + `mediaUniqueId` (same image sent again → no AI call) and the caption in `rawText`. Files are downloaded in memory through `MediaDownloaderRegistry` (each channel registers its downloader) and never stored.
- Voice notes (P5): `ChannelMessageType.AUDIO` (≤ 60 s) → `ExpenseExtractionService.transcribe` (Whisper on Groq, logged as `transcribe`) → the transcription is stored in `rawText` and read like a typed message; the reply starts with "🎙️ Entendí: «…»". A retry from /bandeja only transcribes again if `rawText` is empty.
- Tests never call real APIs: mock `@google/genai` / `openai` with `vi.mock`.
- Golden set (P9): `test/golden/extraction.golden.json`. When the prompt or schema changes, run `pnpm eval:extraction:record` (real AI) so `test/fixtures/ai-responses.json` stays current; `conversation.integration-test.ts` replays those answers with the clock frozen on `recordedAt`. A new flow test needs its message in the golden set first.

## Conversation and Telegram

- `modules/conversation`: channel-agnostic. `ConversationService.handle(ChannelMessage)` returns `BotReply[]` (+ a `notice` for pressed buttons). Channels only map their updates in and render replies out; user-facing texts (Spanish) live in `conversation.messages.ts`.
- One `ExpenseDraft` per expense; one question at a time (`pendingField`); the latest open file is the one text corrections apply to; open files expire after 30 minutes.
- A message is a correction only if it answers the pending question or **starts with a correction keyword** (`monto`, `persona`, `cuota`, `tarjeta`, …; see `correction-parser.ts`). Anything else is a new expense. ✏️ Corregir sends the next message to the AI with the draft.
- Button data: `<action>:<draftId>[:<fieldCode>:<value>]` (`bot-action.codec.ts`), always ≤ 64 bytes (Telegram limit).
- `ExpenseSaverService` creates the record of the destination table and marks the draft as saved in one transaction (`ExpenseDBRepository.saveFromExpenseDraft`), `daily` included. Credit cards: day ≤ closing day → that month, otherwise the next one.
- `modules/telegram`: the webhook (`POST /v1/telegram/webhook`) checks the secret header, answers 200 at once and processes the update in a per-chat in-memory queue (`KeyedQueue`). Chats outside `TELEGRAM_ALLOWED_CHAT_IDS` get a 200 and are ignored.
- Errors (P8): `TelegramClient` retries 429 (waits `retry_after`, up to 30 s), 5xx and network errors twice, with a 10 s timeout. A failed edit is sent as a new message (the work is already done). On shutdown the chat queues get 10 s to finish; on startup, drafts the AI never finished (still `draft`, no data, no question) become `failed` and the chat is told to use `/bandeja`. The same happens when they expire after 30 minutes.
- Observability: `/uso` shows today's AI calls per model against 90 % of its free quota; `GET /v1/health` includes the webhook state from `getWebhookInfo`.

## Database (Turso)

Environments: `.env.local` = SQLite `file:./dev.db`, `.env.dev` = Turso (`libsql://…` + `DATABASE_AUTH_TOKEN`), `.env.test` = `file:./test.db`. All are git-ignored.

Prisma Migrate cannot run against remote Turso. Flow:

1. `pnpm db:migrate --name <name>` creates the migration against local `dev.db` and regenerates the client (Prisma 7 `migrate dev` no longer runs `generate`).
2. `pnpm db:deploy:dev` applies the pending `prisma/migrations/*/migration.sql` to Turso (`scripts/db-deploy.ts`, one batch per migration, tracked in `_app_migrations`; safe to re-run).
3. `pnpm db:seed:dev` if catalogs changed.

Remote Turso does not send SQLite extended codes: a unique violation arrives as `P2039`, not `P2002`. `isPrismaError` handles it; always go through that helper.
