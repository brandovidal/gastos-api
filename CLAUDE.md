# kogane-api

NestJS backend for expense intake from chat (Telegram first, WhatsApp later) with AI extraction. Design and pending decisions live in `../docs/plans/2026-09-22-gastos-bot-ai-design.md`. Structure, rules and tests mirror `clemente/mms-ai`.

## Rules

- Everything in code is in **English**: tables, fields, enum values, exception codes, logs and comments. Only the bot's chat replies to the user are in Spanish.
- Never `git commit` or `push` unless explicitly asked.
- New dependencies: let pnpm pick a version allowed by `minimumReleaseAge` (use a range like `^2.0.0`); never add `minimumReleaseAgeExclude`. Packages with install scripts go in `allowBuilds` in `pnpm-workspace.yaml`.
- Node 22 (`.node-version`), pnpm, NestJS 11 (`nestjs-zod` does not support Nest 12 yet), Prisma 7, Zod 4.
- Personal app: prefer the simplest thing. Redis is only for the reminders (P20, D87: BullMQ queues and the lists of the bell); Turso stays the source of truth and everything works without `REDIS_URL` (tests, CI). No multi-tenant until P23.

## Commands

Tasks live in the `Makefile` + `makefiles/*.mk`, one file per group (`make help` lists them by group); `make dev` = API in watch mode + the tunnel of the `.env.dev` bot (`scripts/dev.sh`); `make dev:only` or `pnpm dev` = only the API; `ENV=dev` (default, `.env.dev`, SQLite `dev.db`) or `ENV=prod` (`.env.prod`, Turso `kogane-db`, production). `package.json` only keeps what Railway, CI and husky call.

```sh
make deps [ENV=prod]     # after pulling: Prisma client + pending migrations + seed + bot command menu
make dev                 # local Redis + API + bot tunnel (dev bot of .env.dev); make dev:only [ENV=prod] = only the API
make redis / redis-stop  # local Redis of the reminders (Docker, localhost:6379)
make notify JOB=due-reminders [ENV=prod]   # run a reminders job now on the running API
make migrate NAME=x     # new migration on local dev.db + prisma generate (non-interactive shell: prisma migrate diff → migrate deploy)
make import-notion [DIR=<csv folder>] [CONFIRM=yes] [RESET=yes] [ENV=prod]   # Notion → Kogane (P14): report first; DIR defaults to ../docs/files/migrations/notion/Seguimiento financiero
make import-notion-reset CONFIRM=yes [ENV=prod]   # deletes only what came from Notion (and imp_batches/imp_rows); steps in docs/import-notion.md
make db-deploy / seed / studio [ENV=prod]
make telegram URL=https://…   # webhook + command menu
make lint / format / build / test / test-integration
make check              # lint + build + unit + integration (what CI runs)
make eval-replay        # golden set with the recorded answers (no AI calls)
make eval-ai CONFIRM=yes [RECORD=1]   # golden set with the REAL AI (~30 calls): only when the user asks
```

## Structure

```
prisma/schema.prisma        prisma.config.ts
src/
  main.ts · app.ts · app.module.ts
  settings/                 configuration + typed models (settings.model.ts), read with ConfigService
  db/prisma/                PrismaService (libSQL adapter: file: locally, libsql:// on Turso)
  db/models/<entity>/       <entity>DB.repository.ts (+ test) · <entity>DB.module.ts · <entity>DB.dto.ts · <entity>DB.serializer.ts (only with JSON columns)
  providers/                external clients: logger (pino), ai/<provider>, telegram, storage (R2), redis (optional)
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
- Swagger (`/docs`, JSON at `/docs-json`): every endpoint has `@ApiTags`, `@ApiOperation` and `@ApiOkResponse` with a response DTO: `class XResponseDto extends responseDto(schema) {}` (`commons/helpers/api-response.helper.ts`, the envelope added by `ResponseInterceptor`; response schemas live in `validations/` next to the request ones and only document). kogane-app generates its types from `/docs-json` (D56), so `app.swagger.test.ts` fails if a REST endpoint has no response schema; `app.routes.test.ts` fails if a route is missing from the document.
- Routes are versioned by URI with default version `1` (`VERSIONING_OPTIONS`): `@Controller('health')` is served at `/v1/health`. Use `@Version('2')` only for breaking changes. Swagger stays at `/docs`.

## Tests

- Vitest projects in `vitest.config.mts`: `unit` (`src/**/*.test.ts`) and `integration` (`src/**/*integration-test.ts`).
- Tests live next to the code. Use `@nestjs/testing` and mock dependencies with `vi.fn()` via `{ provide, useValue }`.
- Integration tests run against a local SQLite file (`file:./test.db`), same engine as Turso. `test/integration.setup.ts` recreates it and applies all migrations before each run.

## Data model

- Enum-like columns are strings (SQLite has no enums); validate them with `commons/constants/expense.constant.ts` and `catalog.constant.ts`.
- `aliases` in `Person` and `PaymentMethod` is a JSON array stored as a string.
- Installments use the `n/m` format (`INSTALLMENT_REGEX`).
- Catalogs live in `src/db/seed/catalog.seed.data.ts` (from the Notion boards). Edit that file and run `make seed` to add people, aliases, cards or categories; exactly one person should have `isDefault`.
- Table names carry a prefix by use (`cat_`, `bud_`, `exp_`, `bot_`, `ntf_`, `ai_`, `imp_`) through `@@map`; model names do not.
- `ExpenseDraft` (`bot_expense_drafts`) is every expense received from a chat while the bot works on it. Its open row (`draft` or `awaiting_confirmation`) is the conversation state of that chat; there is no session table. `@@unique([channel, chatId, messageId, itemIndex])` makes webhook retries idempotent (`DuplicateExpenseDraftException`). Saving a draft creates the record of its destination table, linked by `draftId`.
- `DailyExpense` (`exp_daily_expenses`) holds only confirmed day-to-day expenses ("gastos sin culpa").
- Credit cards are `PaymentMethod` rows of type `credit_card` (with `code` and billing days); there is no card table. `showInBot` decides the quick replies. The payment method decides daily vs credit card (`applyPaymentMethodRule`).
- Debts (P17, D60): `Debt` (`exp_debts`) is one row per installment with `direction` (`owed_to_me` · `i_owe`), `installment` n/m and payment month; `DebtPayment` (`exp_debt_payments`) holds the payments. `paidAmount`, `paidDate` and `status` (`pending · partial · prepaid · paid`) are recomputed in the same transaction as every payment change (`DebtDBRepository.recompute`, `debtStatusFor`); "late" and "upcoming" are computed from today (`debtTiming`). The bot saves `receivable` (me deben) and `payable` (le debo) drafts there; "1/n" creates the n installments. `exp_accounts_receivable` was copied by the migration and is dropped by a later one.
- `AiRequestLog` stores one row per AI call to count usage against the free daily quota.
- Repositories never leak Prisma errors: map them with `isPrismaError` to `AppException`s.

## AI extraction

- `providers/ai/`: `AiExtractorProviderStrategy` → `GeminiExtractorService` (primary, images) and `GroqExtractorService` (text-only fallback). Providers return raw JSON text; `modules/expense-extraction` validates it.
- Route: text → Qwen on Groq → Gemini Flash-Lite (`AI_TEXT_PRIMARY=groq`, default; `gemini` swaps them); image → Gemini Flash-Lite → Gemini Flash. Groq allows ~1,000 output tokens per minute, so bursts fall back to Gemini. A model is skipped at 90 % of its daily free quota (counted from `AiRequestLog`).
- The AI picks catalog values by short refs (`p1`, `pm2`, `cc1`, `cat3`); `expense-extraction.resolver.ts` maps them to ids and computes `missingFields`. Never send database ids or secrets to the AI.
- Simple corrections go through `correction-parser.ts` first; the AI is only called when it returns `null`.
- Images (P4): a photo or `image/*` file becomes `ChannelMessageType.IMAGE`; the draft keeps `mediaFileId` + `mediaUniqueId` (same image sent again → no AI call) and the caption in `rawText`. The first download goes through `MediaDownloaderRegistry` (each channel registers its downloader); then the bytes are kept in R2 and the draft points to them with `fileId`.
- Files (D58, `modules/stored-files`): **the database never stores bytes**. `bot_files` (`StoredFile`) keeps the R2 key and metadata: `<STORAGE_ENV>/finance/drafts/<yyyy-mm>/…` (`temporary`, 7 days) → `<env>/finance/expenses/<yyyy>/<mm>/…` (`kept`) when an expense is saved (`ExpenseSaverService` → `keep`, failure only logs). The `files-cleanup` job (every 6 h, P20) deletes expired ones (row stays `deleted`); an expired file makes the draft `failed` (`TEXTS.fileExpired`). Same `sha256` → the stored file is reused. Deleting an expense (`ExpensesService.delete`) releases its file only when no other expense or draft under review uses it (`countUses`). `STORAGE_ENV=dev|prod` always uses R2 (boot fails without keys); only `test` uses `LocalStorage`. Signed URLs for kogane-app last 10 min.
- Voice notes (P5): `ChannelMessageType.AUDIO` (≤ 60 s) → `ExpenseExtractionService.transcribe` (Whisper on Groq, logged as `transcribe`) → the transcription is stored in `rawText` and read like a typed message; the reply starts with "🎙️ Entendí: «…»". A retry from /borrador only transcribes again if `rawText` is empty.
- Tests never call real APIs: mock `@google/genai` / `openai` with `vi.mock`.
- Golden set (P9): `test/golden/extraction.golden.json`. When the prompt or schema changes, ask the user before running `make eval-ai CONFIRM=yes RECORD=1` (real AI, burns quota) so `test/fixtures/ai-responses.json` stays current; `conversation.integration-test.ts` replays those answers with the clock frozen on `recordedAt`. A new flow test needs its message in the golden set first.

## Conversation and Telegram

- `modules/conversation`: channel-agnostic. `ConversationService.handle(ChannelMessage)` returns `BotReply[]` (+ a `notice` for pressed buttons). Channels only map their updates in and render replies out; user-facing texts (Spanish) live in `conversation.messages.ts`.
- One `ExpenseDraft` per expense; one question at a time (`pendingField`); the latest open file is the one text corrections apply to; open files expire after 30 minutes.
- A message is a correction only if it answers the pending question or **starts with a correction keyword** (`monto`, `persona`, `cuota`, `tarjeta`, …; see `correction-parser.ts`). Anything else is a new expense. ✏️ Corregir sends the next message to the AI with the draft.
- ✅ Guardar and 📝 Borrador edit the summary in place (no notification) and also send a short new message (`buildSavedNotice`, `buildParkedNotice`) so the chat shows and notifies the result.
- Button data: `<action>:<draftId>[:<fieldCode>:<value>]` (`bot-action.codec.ts`), always ≤ 64 bytes (Telegram limit). The help (`/start`, `/ayuda`, `buildHelpReply`) shows the everyday commands as buttons `cmd:<command>`, run by `handleCommand` as if typed.
- `ExpenseSaverService` creates the record of the destination table and marks the draft as saved in one transaction (`ExpenseDBRepository.saveFromExpenseDraft`), `daily` included. Credit cards: day ≤ closing day → that month, otherwise the next one. "1/n" creates the n installments, one per billing month, for debts (D60) and credit cards (D66, `withInstallments`); `save` returns which (`installments`) and what the expense adds to its category budget (`budget`: PEN day to day by date, fixed costs and cards by payment month; subscriptions and debts add nothing, D46).
- D66: a card "1/n" whose amount has a low confidence (deduced total / n, e.g. the IO template) is confirmed before saving (`needsInstallmentConfirmation`, buttons `cuo` / `cuoe`: ✅ Sí · ✏️ Otro monto asks the amount); Guardar todos leaves it in Borrador.
- Shared expenses (D73–D75): `shared-expense.parser.ts` reads the split without the AI (mitad, a medias, entre N, tercera parte, 20 %, "dany paga 20", "compartido con X y yo", several people; names may be a little off, `findCatalogEntryByName` with Levenshtein ≤ 2); otherwise the AI answers `shares` (optional) and `resolveExpense` makes the user the payer. The draft keeps `sharedWith` (`{ shares: [{ personId, ratio?, amount? }] }`; the first `{ personIds, parts }` format is still read). The bot shows two messages: the summary ("pagas tú") and the split (`buildShareReply`, buttons `shr:<draftId>:<person index>:<h|t|p20|m|x>`, ✏️ Editar waits for `share:<index>`; a number above the total and up to 100 is a percentage). It comes once the expense is complete, and again only when the amount or installment changes. Telegram remembers its id (`trackShareOf` → `rememberShareMessage` → `shareMessageId`): a new split closes the previous one (`editMessageId`), and saving, Borrador or Descartar close it with the final split (`buildClosedShareReply`); the closed summary also lists who owes what. An old split button of a closed expense shows that final split. On save the row keeps the total the user paid and `othersShare` (each installment too), and one `owed_to_me` debt per person and installment is created in the same transaction with `originDraftId`; the budget counts `amount − othersShare`. With an expense open, a message that only says the split ("compartido con dany a medias", `parseShareCorrection`) shares it and makes the user the payer, without the AI.
- /editar (D76): `saved-search.parser.ts` turns the text into filters (amount, date, catalog names, the rest in the concept) for `ExpenseDraftDBRepository.searchSaved`; ✏️ (`eds:<draftId>`) opens an `editing` copy (`createEditCopy`, `replacesDraftId`) that corrections keep in `editing` (`keepEditing`). Saving it deletes the original's rows (`draftId` or `originDraftId`) and marks the original discarded in the same transaction; `SavedExpenseLockedException` when one of its debts has payments. ❌ Cancelar or 30 minutes without saving drop the copy.
- `modules/telegram`: the webhook (`POST /v1/telegram/webhook`) checks the secret header, answers 200 at once and processes the update in a per-chat in-memory queue (`KeyedQueue`). Chats outside `TELEGRAM_ALLOWED_CHAT_IDS` get a 200 and are ignored.
- Errors (P8): `TelegramClient` retries 429 (waits `retry_after`, up to 30 s), 5xx and network errors twice, with a 10 s timeout. A failed edit is sent as a new message (the work is already done). On shutdown the chat queues get 10 s to finish; on startup, drafts the AI never finished (still `draft`, no data, no question) become `failed` and the chat is told to use `/borrador`. The same happens when they expire after 30 minutes.
- Borrador (D50, formerly Bandeja): `REVIEW_EXPENSE_DRAFT_STATUSES` = open + `pending_review` + `failed`. 📝 Borrador (`BotAction.LATER`) parks a draft as `pending_review`; open drafts older than 30 minutes move there too (`moveStaleOpenToReview`) instead of being discarded.
- Bank screenshots (P21, D47, D63): `modules/recognition` reads every image first with local OCR (`OcrService`: tesseract.js, Spanish, `PSM.SPARSE_TEXT`, since the default single-block mode skips big amounts; one worker per image, model cached in `OCR_CACHE_DIR`). Pure templates in `recognition.templates.ts` read the IO purchase detail (cuotas → one installment of total / n, D45), the IO summary by category and the Interbank movement (Plin/transfer). Each template returns `null` when something does not add up, and the image then goes to the AI. Yape and the IO list always go to the AI. Every attempt is logged in `AiRequestLog` (provider `local`, model `tesseract`, operation `recognize`); `/uso` shows how many were solved without AI. The summary by category creates no expense: it answers the reconciliation of the month (`reconcile`, primary card) and the draft is discarded. The draft keeps the screen in `documentType`. `OCR_ENABLED=false` in `.env.test` and CI; the conversation integration test stubs `OcrService`. `make ocr-probe [DIR=…]` runs the same OCR + templates on a folder without AI (full text in the git-ignored `test/eval/ocr-report/`).
- Primary card: `PaymentMethod.isPrimary` (IO in the seed). A card screenshot that does not show which card goes to it (`withPrimaryCard`).
- Lists of screenshots (P21): every image message gets a `batchId` (uuid). An album (Telegram `media_group_id`: `TelegramService` waits `ALBUM_WAIT_MS` after the last photo and sends one `ChannelMessage` with `album`) or an image with several expenses that leaves 2+ open drafts in one batch is answered with one list (`buildBatchReply`); replies without buttons (failures, the reconciliation, repeated images) still go out. Buttons `all|each|park:<batchId>`: ✅ Guardar todos saves the complete ones and parks the repeated or incomplete ones in Borrador; 📝 Revisar uno por uno sends each summary; 📝 Borrador parks them all.
- Duplicates: same operation number, or (without one) same card + day + amount + merchant prefix (`sameMerchant`) in the last 60 days. Only a warning, and Guardar todos skips them.
- Debts in the chat (P17): "dany me pagó 150", "abono 150 dany" or "le pagué 50 a dany" are read by `debt-payment.parser.ts` (no AI; the name must be a whole person name or alias) and only when that person has something open in that direction. The payment covers the oldest installments first (`allocatePayment`) and is saved as unconfirmed `DebtPayment` rows grouped by `batchId` until ✅ Confirmar (`pay:<batchId>`; ✏️ Elegir cuota `payl`/`payp:<batchId>:<debtId>`; ❌ `payx`); proposals expire after 30 minutes. `/deudas [persona]` and `/cobrar <persona>` read the command text (channels pass it along with the command).
- The AI answer also has `unreadable` (list items covered or cut off: the bot names them so they are sent again, P21) and `received` ("Te yapearon": not an expense; when the sender is a catalog person with open debts it proposes the payment like "dany me pagó 150", P17). Both optional, so recorded answers still replay.
- Budget in the bot (P19): after ✅ Guardar (and Guardar todos) `BudgetService.alertAfterSave` adds "⚠️ Comida: 85 % del presupuesto" / "🔴 … 104 %" only when that expense crossed the threshold or 100 %. `/presupuesto [mes] [año]` (`month-arg.parser.ts`) shows text bars per category with a limit and the surplus; `/pronostico` projects this month linearly (`budget.calculator.ts`). No AI.
- Replies that mention /borrador, /ultimos or /resumen get those commands as buttons (`withCommandButtons`, `cmd:<command>`); the help (`/start`, `/ayuda`) shows the everyday ones. `/deudas [persona]` offers 📥 Excel · 📄 PDF (`rep:<format>-<personId|all>`): the reply carries a `document` that Telegram sends with `sendDocument`; the web chat drops it (`withoutDocuments`).
- Observability: `/uso` shows today's AI calls per model against 90 % of its free quota; `GET /v1/health` includes the webhook state from `getWebhookInfo`.

## Reminders and notifications (P20, D86–D89)

- `providers/redis` (`RedisService`, global): optional; without `REDIS_URL` it is null, no job is scheduled and the lists are read from the database (`/v1/health` shows `redis: DISABLED`). Railway: a Redis service with `maxmemory-policy noeviction` and "Serverless" off (`docs/deploy.md`).
- `modules/notifications/notification-queue.service.ts` (`NotificationQueue`, global module): BullMQ queues `ntf-schedule` (one job scheduler per `NotificationJob`, cron in `America/Lima`, upserted on start; a job whose time passed while down runs when the process comes back) and `ntf-deliver` (Telegram, `jobId` = notification id, 5 attempts with exponential backoff). `requestRefresh()` rebuilds the upcoming list 30 s after the last change (BullMQ deduplication); `UpcomingRefreshInterceptor` calls it after every POST/PUT/PATCH/DELETE.
- Jobs (`NotificationJobsService.run`, also `POST /v1/notifications/run/:job` and `make notify JOB=`): `recurring` day 1 06:00 (`RecurringExpensesService.generate`: pending rows, `lastGeneratedAt` = first day of the last month generated, never twice), `due-reminders` 09:00 (what closes or is due tomorrow and is unpaid), `daily-close` 21:00 (today's expenses, what is still due today, categories at 80 % / 100 % and cargos raros), `weekly` Sunday 20:00, `upcoming-refresh` hourly, `files-cleanup` every 6 h. Workers start in the API process (`NotificationWorkers`).
- Every notice is one `Notification` row (`ntf_notifications`) with a unique `dedupeKey` (`due:<kind>:<ref>:<day>`, `daily:<day>`, `budget:<category>:<yyyy-mm>:<status>`, `anomaly:…`), so running a job twice sends nothing twice. `NotificationsService.notify` checks `ntf_settings` (defaults in `DEFAULT_NOTIFICATION_SETTINGS`: all on, the daily close only in the web): web off = saved already read; Telegram on = queued for delivery (sent at once without Redis) to the `TELEGRAM_ALLOWED_CHAT_IDS` chats until P23. Title and body are plain Spanish text (`notification.messages.ts`); Telegram escapes them and adds the buttons.
- Redis lists (`NotificationCache`, never the source of truth: a missing list is rebuilt from the database): `ntf:upcoming` (sorted set, 45 days of `CalendarEvent`, `GET /v1/reminders`, `/calendario`), `ntf:recent` + `ntf:unread` (the bell; invalidated when something is read) and `ntf:await:<chatId>` (✏️ Editar monto, 10 min; in memory without Redis).
- Cargos raros (`notification.rules.ts`, no AI): a card charge whose name matches a subscription (`sameMerchant`) with another price than its previous charge or the subscription; the same amount, method and merchant within 48 h; a monthly subscription unpaid 3 days after its due date with no card charge of its name. Only expenses registered in the last 2 days are checked.
- `modules/calendar` (D89): `CalendarService.events(from, to)` computed from the tables (no table of its own): card closing and payment days (`statementDates`: the statement of month M closes on its closing day and is paid on the due day of M, or of M+1 when the due day comes first), `dueDate` of fixed costs, subscriptions and debts, and recurring expenses not generated yet. `installments(months)` adds the card installments per month, estimating the ones "por generar" of a series saved only up to some installment. `pay(refType, refId)` is ✅ Pagado for the bot and `POST /v1/calendar/pay` (card statement = its unpaid rows).
- Bot (`NotificationsBotService`, called by `ConversationService`): buttons `ntf:<notificationId>:<p|e|m>` (✅ Pagado · ✏️ Editar monto / Otro monto · 🔕 Silenciar), `ntfs:<kind>` for `/avisos`; `/calendario` (14 days) and `/cuotas` (3 months). An amount typed after ✏️ is taken before anything else; any other text drops the wait.

## Imports and bank statements (P14, D90–D95)

- Notion (`modules/imports/notion`, `scripts/import-notion.ts`, `make import-notion`): the CSV exports of the 9 boards (`detectBase` by file name or columns) → `mapRow` (pure: `notion.values.ts` reads months, amounts, dates, statuses, periods; names through `findCatalogEntryByName`) → `NotionImporter.plan` (report: rows, blocking issues such as a name missing in the catalog, rows already imported, totals per month like the Notion Resumen) → `apply` with `CONFIRM=yes`. Every imported row of `exp_fixed_costs`, `exp_subscriptions`, `exp_credit_card_expenses` and `exp_debts` carries a unique `importKey` (hash of the row fingerprint + its occurrence), so importing again updates instead of duplicating; a debt marked Pagado or Amortizado in Notion gets one payment. `RESET=yes` deletes only rows with an `importKey`; the salary per month and the % of the budget groups are overwritten by the import and not reverted. Plataformas' "Persona" (Personal/Compartido) is not a person: the owner. Notion exports each board as `X.csv` (the filtered view) and `X_all.csv`: only `_all` is read. Old rows without "Año de pago" take the year from their date (`yearNear`); rows without an amount are skipped with a warning. The report checks every month against the Resumen: Notion's "Gastos" adds up the rows linked to that Resumen page (any currency, a row linked to two pages counts in both), not the payment month, so `linked` must equal `notionSpent`. From the web (D104, `modules/imports`: `POST /v1/imports/notion` with the ZIP or the CSV files → `unpackNotionFiles`, `GET /v1/imports[/:id[/rows]]`, `POST /:id/apply`, `DELETE /:id`) an import is first a **preview**: `imp_batches.status = preview` and every row in `imp_rows` with its `kind` (expense, group, budget, issue), `destination`, the Kogane row as JSON (`data`) and status; nothing touches the expenses until apply. `make import-notion CONFIRM=yes` does preview + apply in one go. Each run is an `imp_batches` row, and every imported row is kept in `imp_rows` (CSV row as JSON + `targetTable`/`targetId`, same `importKey`): on the next import a row whose CSV is identical is `unchanged` and not touched (edits made in Kogane stay), a different one is `changed` and updated, the rest are `new`. New rows are inserted in chunks of 200 (`createManyAndReturn` + `imp_rows.createMany`), so the first import against Turso takes one round trip per chunk. The script stops before reading anything if the database has pending migrations (`_app_migrations` on Turso, `_prisma_migrations` on SQLite): `make db-deploy ENV=…` first.
- Bank statements (`modules/statements`, `imp_statements` + `imp_statement_rows`): `POST /v1/statements` (multipart PDF, optional `password` and `paymentMethodId`) → `readPdfLines` (`pdfjs-dist`, ESM loaded with a native `import()`; the password is `Person.documentNumber` of the owner, D94: stored whole, answered masked by `/v1/people`, never logged nor sent to the AI) → `parseStatementLines` (generic, no AI: dates, totals, due date, purchases without payments or credits; trusted only when `templateAddsUp`) or `ExpenseExtractionService.generateStructured` with the masked text (`maskForAi`, operation `statement`) → `reconcileStatement` against the card expenses of the payment month (same amount, same installment or ±3 days, `sameMerchant` breaks ties) → rows `matched`/`new`, plus the expenses missing from the statement computed on read. `create-new` makes pending card expenses; `PATCH …/rows/:rowId` ignores or restores a row. The statement's due date and total feed the card payment of the calendar (P20) and a `statement` notification sums it up. Bank templates for specific PDFs are pending real samples.

## REST API for kogane-app (P7)

- Every route uses `@ApiRest(tag)` (`commons/decorators/api-rest.decorator.ts`): Swagger tag, `x-api-key` and `ApiKeyGuard` (constant-time comparison).
- `modules/catalogs`: people, payment-methods (deactivated, never deleted), categories, budget-groups (409 `CATALOG_ITEM_IN_USE` while used).
- `modules/expenses`: `/v1/expenses/:resource` (`ExpenseResource`: daily-expenses, fixed-costs, subscriptions, credit-card-expenses, recurring-expenses) on `ExpenseRecordDBRepository`, validated per resource in `EXPENSE_SCHEMAS`. "Nuevo gasto" of the web creates a draft (`POST /v1/drafts`); reading text, screenshots or voice with the AI is done by Mensajes (D79).
- `modules/drafts`: Borrador (`tab=review|failed|discarded`), Nuevo gasto (`POST /v1/drafts` channel `web`, input `manual`), save through `ExpenseSaverService` like the bot, retry through `ConversationService.retryExtraction`. Web edits keep drafts in `pending_review` so they never reopen a chat.
- `modules/messages`: web chat = channel `web` (`WEB_CHAT_ID`), multipart text/image/voice; uploads go through `StoredFilesService.storeTemporary` and the draft keeps its `fileId`.
- `modules/debts` (P17, D60): `/v1/debts` CRUD (`installments: n` creates one row per month), `GET /v1/debts/summary` (per person: owed to me · I owe · net · late · due this month) and `POST|DELETE /v1/debts/:id/payments` (422 above the balance).
- `modules/budget` (P19): `BudgetService` (month budget, spending per category and group, surplus D65 = salary + extra incomes − spent, history, alert on save), counting only the expenses of the default person (D71, `PersonDBRepository.findDefault`) on `budget.calculator.ts` (pure). `/v1/incomes` CRUD (`bud_incomes`, extras only; the salary stays in `bud_monthly_budgets`), `GET|PUT /v1/category-budgets` + `DELETE /:id` (`CategoryBudget`: row without month = every month, with month replaces it; SQLite keeps NULLs distinct in unique indexes, so the general row is upserted by hand).
- `modules/summary`: month totals by destination and person plus `BudgetService.month` (a month without salary proposes the latest one with `budget.isProposal`, saved with `PUT /v1/summary/budget`); `GET /v1/summary/history?months=6`. Spending leaves subscriptions out (D46).
- `modules/notifications` + `modules/calendar` (P20): `GET /v1/notifications` (history), `/recent` and `/unread-count` (the bell), `PATCH /:id/read`, `POST /read-all`, `GET|PUT /settings`, `POST /run/:job`; `GET /v1/reminders?days`; `GET /v1/calendar?from&to` (≤ 100 days), `GET /v1/calendar/installments?months`, `POST /v1/calendar/pay`; `POST /v1/recurring-expenses/generate`.
- `modules/reports` (D39): `GET /v1/reports/debts?format=xlsx|pdf[&personId]` with `exceljs` and `pdfkit` (Resumen + Detalle por cuota). `ResponseInterceptor` lets `StreamableFile` through without the JSON envelope; `app.swagger.test.ts` accepts the file types as documented content.

## Deployment (P10)

- `Dockerfile` + `railway.json` (health `/v1/health`); `.github/workflows/deploy.yml` runs `unit-test.yml`, then migrations and seed (`scripts/db-deploy.ts`, `prisma/seed.ts`) and `scripts/telegram-setup.ts`; Railway deploys from GitHub itself, after CI ("Wait for CI"). `PUBLIC_URL`: prod `https://kogane-api.up.railway.app`, local via `make dev` / `make tunnel` (`scripts/tunnel.sh`, always `.env.dev`; restores the prod webhook on exit only when dev and prod share the bot token). Guide: `docs/deploy.md`.
- The `image` job of `deploy.yml` runs `make docker` (`scripts/docker-smoke.sh`, also the local check): builds the image and requires `/v1/health` 200 and `/docs` 404 before migrating Turso. The Prisma generator pins `importFileExtension = ""`: during the Docker install there is no `tsconfig.json` yet and Prisma 7 would emit `./internal/class.ts` imports that crash on start. `.dockerignore` excludes `src/generated`.
- `NODE_ENV=production` turns Swagger off (`isDocsEnabled`) and logs to JSON. Migrations must be backward compatible: they run before the new code.

## Database (Turso)

Environments: `.env.dev` = SQLite `file:./dev.db`, `.env.prod` = Turso `kogane-db`, production (`libsql://…` + `DATABASE_AUTH_TOKEN`), `.env.test` = `file:./test.db`. All are git-ignored.

Prisma Migrate cannot run against remote Turso. Flow:

1. `make migrate NAME=<name>` creates the migration against local `dev.db` and regenerates the client (Prisma 7 `migrate dev` no longer runs `generate`).
2. In production the deploy workflow (`.github/workflows/deploy.yml`) does it; by hand, `make db-deploy ENV=prod` (or `make deps ENV=prod`) applies the pending `prisma/migrations/*/migration.sql` to Turso (`scripts/db-deploy.ts`, tracked in `_app_migrations`; safe to re-run). Each migration runs with libSQL `migrate()`, which turns foreign keys off outside the transaction (SQLite ignores `PRAGMA foreign_keys=OFF` inside one, so a table redefinition would fire `ON DELETE SET NULL`); the migration's own PRAGMA lines are skipped and `PRAGMA foreign_key_check` runs after it.
3. `make seed ENV=prod` if catalogs changed (the deploy workflow also seeds).

Remote Turso does not send SQLite extended codes: a unique violation arrives as `P2039`, not `P2002`. `isPrismaError` handles it; always go through that helper.
