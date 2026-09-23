// Golden set evaluation of the AI extraction (P9). The real-AI run burns the free daily quota: only when asked,
// never in CI.
//   make eval-replay                      score the recorded answers again without calling the AI (free)
//   make eval-ai CONFIRM=yes              score every case of test/golden/extraction.golden.json with the REAL AI
//   make eval-ai CONFIRM=yes RECORD=1     also save the raw answers to test/fixtures/ai-responses.json, which the
//                                         conversation integration tests replay
// The report is printed and saved to test/eval/last-report.txt (git-ignored).
// Images (P4): put real screenshots in test/golden/images/ (git-ignored: they carry personal data) with a cases.json
// like [{ "file": "yape-1.jpg", "message": "persona dany", "expected": [{ "amount": 18, "paymentMethod": "Yape" }] }].
// They are scored with the text cases; replay skips them.
// Uses .env.local (catalogs from the local dev.db) and counts against the free daily quota (~1 call per case).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { Test } from '@nestjs/testing'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import { AiInputPartType } from '@/commons/constants/ai.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { PrismaModule } from '@/db/prisma/prisma.module'
import { PrismaService } from '@/db/prisma/prisma.service'
import { ExpenseExtractionModule } from '@/modules/expense-extraction/expense-extraction.module'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { findCatalogEntryById } from '@/modules/expense-extraction/expense-extraction.catalog'
import { ExtractionCatalog, ResolvedExpense } from '@/modules/expense-extraction/dto/expense-extraction.types'
import { AiExtractorProviderStrategy } from '@/providers/ai/ai-extractor-provider.strategy'
import { AiExtractorProvider, GenerateJsonRequest } from '@/providers/ai/dto/ai-extractor.dto'
import { SettingsModule } from '@/settings/settings.module'

const ROOT = join(__dirname, '..')
const GOLDEN_FILE = join(ROOT, 'golden', 'extraction.golden.json')
const FIXTURES_FILE = join(ROOT, 'fixtures', 'ai-responses.json')
const IMAGES_DIR = join(ROOT, 'golden', 'images')
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const MIN_ACCURACY = 0.9
// Free tiers limit requests per minute: space the calls so the eval measures the primary model
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 4_000)
const RECORD = process.env.EVAL_RECORD === '1'
const REPLAY = process.env.EVAL_REPLAY === '1'
const REPORT_FILE = join(__dirname, 'last-report.txt')

type ExpectedExpense = Record<string, string | number | null>
interface GoldenCase {
  message: string
  expected: ExpectedExpense[]
  file?: string // image cases only
}

// Optional real screenshots, never committed
function loadImageCases(): GoldenCase[] {
  const casesFile = join(IMAGES_DIR, 'cases.json')
  if (REPLAY || !existsSync(casesFile)) return []
  return (JSON.parse(readFileSync(casesFile, 'utf8')) as GoldenCase[]).map((golden) => ({
    ...golden,
    message: golden.message ?? '',
  }))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// The value of a resolved expense in golden-set terms (catalog names, relative dates)
function actualValue(field: string, expense: ResolvedExpense, catalog: ExtractionCatalog, today: string) {
  const name = (id: string | null) => findCatalogEntryById(catalog, id)?.name ?? null

  switch (field) {
    case 'person':
      return name(expense.personId)
    case 'paymentMethod':
      return name(expense.paymentMethodId)
    case 'category':
      return name(expense.categoryId)
    case 'spentAt':
      if (expense.spentAt === today) return 'today'
      if (expense.spentAt === DateHelper.addDays(today, -1)) return 'yesterday'
      return expense.spentAt
    default:
      return (expense as unknown as Record<string, string | number | null>)[field] ?? null
  }
}

const sameValue = (expected: unknown, actual: unknown) =>
  typeof expected === 'number' && typeof actual === 'number' ? Math.abs(expected - actual) < 0.01 : expected === actual

describe('AI extraction golden set', () => {
  it(`should get at least ${MIN_ACCURACY * 100} % of the golden fields right`, async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SettingsModule, PrismaModule, ExpenseExtractionModule],
    }).compile()
    await moduleRef.init()

    const extraction = moduleRef.get(ExpenseExtractionService)
    const recorded: Record<string, string> = {}
    const replayed: Record<string, string> = REPLAY
      ? (JSON.parse(readFileSync(FIXTURES_FILE, 'utf8')) as { responses: Record<string, string> }).responses
      : {}

    // Record the raw answer of each case, keyed by the user message (the first text part)
    const strategy = moduleRef.get(AiExtractorProviderStrategy)
    const getProvider = strategy.getProvider.bind(strategy)
    strategy.getProvider = (type) => {
      const provider = getProvider(type)
      return {
        ...provider,
        provider: provider.provider,
        supportsImages: provider.supportsImages,
        generateJson: async (request: GenerateJsonRequest) => {
          const message = request.parts.find((part) => part.type === AiInputPartType.TEXT)
          if (REPLAY) {
            const text = message && 'text' in message ? replayed[message.text] : undefined
            if (!text) throw new Error('no recorded answer for this message')
            return { text }
          }
          const response = await provider.generateJson(request)
          const hasImage = request.parts.some((part) => part.type === AiInputPartType.IMAGE)
          if (!hasImage && message && 'text' in message && !(message.text in recorded)) {
            recorded[message.text] = response.text
          }
          return response
        },
      } satisfies AiExtractorProvider
    }

    const { cases: textCases } = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as { cases: GoldenCase[] }
    const cases = [...textCases, ...loadImageCases()]
    const catalog = await extraction.loadCatalog()
    // Replayed answers carry the dates of the day they were recorded
    const today = REPLAY
      ? (JSON.parse(readFileSync(FIXTURES_FILE, 'utf8')) as { recordedAt: string }).recordedAt
      : DateHelper.todayIn(APP_TIME_ZONE)

    const byField = new Map<string, { ok: number; total: number }>()
    const failures: string[] = []
    const models = new Map<string, number>()
    let casesOk = 0

    for (const [index, { message, expected, file }] of cases.entries()) {
      if (index && !REPLAY) await sleep(DELAY_MS)

      let expenses: ResolvedExpense[] = []
      try {
        const images = file
          ? [
              {
                mimeType: MIME_BY_EXTENSION[file.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/jpeg',
                data: readFileSync(join(IMAGES_DIR, file)).toString('base64'),
              },
            ]
          : undefined
        const result = await extraction.extract({ text: message || undefined, images })
        expenses = result.expenses
        // Replayed answers keep the model that recorded them, not the current route
        const label = REPLAY ? 'replay (recorded answers)' : `${result.provider}/${result.model}`
        models.set(label, (models.get(label) ?? 0) + 1)
      } catch (error) {
        failures.push(`"${file ?? message}": extraction failed (${(error as Error).message})`)
      }

      let caseOk = expenses.length === expected.length
      const count = byField.get('expenseCount') ?? { ok: 0, total: 0 }
      byField.set('expenseCount', { ok: count.ok + (caseOk ? 1 : 0), total: count.total + 1 })
      if (!caseOk) failures.push(`"${file ?? message}": expected ${expected.length} expense(s), got ${expenses.length}`)

      // Expenses are compared in order; a missing one fails all its fields
      expected.forEach((fields, position) => {
        for (const [field, value] of Object.entries(fields)) {
          const actual = expenses[position] ? actualValue(field, expenses[position], catalog, today) : undefined
          const ok = sameValue(value, actual)
          const stats = byField.get(field) ?? { ok: 0, total: 0 }
          byField.set(field, { ok: stats.ok + (ok ? 1 : 0), total: stats.total + 1 })
          if (!ok) {
            caseOk = false
            failures.push(`"${file ?? message}" #${position + 1} ${field}: expected ${value}, got ${actual}`)
          }
        }
      })
      if (caseOk) casesOk++
    }

    const ok = [...byField.values()].reduce((sum, { ok: fieldOk }) => sum + fieldOk, 0)
    const total = [...byField.values()].reduce((sum, { total: fieldTotal }) => sum + fieldTotal, 0)
    const accuracy = ok / total

    const report = [
      '',
      `Golden set: ${casesOk}/${cases.length} cases fully right · fields ${ok}/${total} (${(accuracy * 100).toFixed(1)} %)`,
      `Models: ${[...models].map(([model, calls]) => `${model} ×${calls}`).join(', ')}`,
      ...[...byField].map(
        ([field, stats]) =>
          `  ${field.padEnd(14)} ${stats.ok}/${stats.total} (${((stats.ok / stats.total) * 100).toFixed(0)} %)`,
      ),
      ...(failures.length ? ['Failures:', ...failures.map((failure) => `  ✗ ${failure}`)] : []),
    ].join('\n')
    // stderr: Vitest may hide console.log of passing tests
    process.stderr.write(`${report}\n`)
    writeFileSync(REPORT_FILE, `${report}\n`)

    if (RECORD) {
      writeFileSync(FIXTURES_FILE, `${JSON.stringify({ recordedAt: today, responses: recorded }, null, 2)}\n`)
      console.log(`Recorded ${Object.keys(recorded).length} AI answers in ${FIXTURES_FILE}`)
    }

    await moduleRef.get(PrismaService).$disconnect()
    expect(accuracy).toBeGreaterThanOrEqual(MIN_ACCURACY)
  })
})
