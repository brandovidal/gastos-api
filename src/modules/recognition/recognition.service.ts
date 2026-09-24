import { Injectable, Logger } from '@nestjs/common'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import { AiOperation, AiProvider, OCR_MODEL } from '@/commons/constants/ai.constant'
import { CatalogKind } from '@/commons/constants/expense-extraction.constant'
import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { AiRequestLogDBRepository } from '@/db/models/ai-request-log/aiRequestLogDB.repository'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import {
  findDefaultPerson,
  findPrimaryCard,
  matchCatalogEntry,
  normalizeText,
} from '@/modules/expense-extraction/expense-extraction.catalog'
import { completeExpense } from '@/modules/expense-extraction/expense-extraction.resolver'
import {
  ExtractionCatalog,
  MediaFile,
  ResolvedExpense,
} from '@/modules/expense-extraction/dto/expense-extraction.types'

import { OcrService } from './ocr.service'
import { RecognitionResult, RecognizedExpense, recognizeText, RecognizedScreen } from './recognition.templates'

// Categories of the card app → catalog (P21 rules); the rest stay empty and the user picks one
const BANK_CATEGORIES: Record<string, string> = {
  delivery: 'Comida',
  restaurantes: 'Comida',
  supermercados: 'Comida',
  taxi: 'Transporte',
  transporte: 'Transporte',
  entretenimiento: 'Entretenimiento',
  salud: 'Salud',
  farmacias: 'Salud',
  educacion: 'Estudio',
}

// What the template read is certain except the amount of an installment (total / n: interest is unknown, D45)
const TEMPLATE_CONFIDENCE = 0.95
const INSTALLMENT_AMOUNT_CONFIDENCE = 0.5

export interface CardReconciliation {
  card: string
  month: number
  year: number
  appTotal: number
  registered: number
  categories: { name: string; amount: number; count: number }[]
}

// Hybrid recognizer (D47, D63): local OCR + templates for IO purchase detail, IO category summary and Interbank
// movement. null means "use the AI" (Yape, IO list, anything that does not add up, or OCR errors).
@Injectable()
export class RecognitionService {
  private readonly logger = new Logger(RecognitionService.name)

  constructor(
    private readonly ocrService: OcrService,
    private readonly aiRequestLogDBRepository: AiRequestLogDBRepository,
    private readonly expenseDBRepository: ExpenseDBRepository,
  ) {}

  async recognize(image: MediaFile, draftId: string): Promise<RecognitionResult | null> {
    if (!this.ocrService.enabled) return null

    const startedAt = Date.now()
    let result: RecognitionResult | null = null
    let errorCode: string | null = null
    try {
      result = recognizeText(await this.ocrService.read(image))
      if (!result) errorCode = 'NO_TEMPLATE'
    } catch (error) {
      errorCode = 'OCR_FAILED'
      this.logger.warn(`[recognize] OCR failed: ${(error as Error).message}`)
    }

    // /uso counts the screenshots the OCR solved without the AI
    await this.aiRequestLogDBRepository.create({
      provider: AiProvider.LOCAL,
      model: OCR_MODEL,
      operation: AiOperation.RECOGNIZE,
      draftId,
      success: !!result,
      errorCode,
      latencyMs: Date.now() - startedAt,
    })
    return result
  }

  // The expenses a template read, with catalog ids, as the AI would return them
  toExpenses(recognized: RecognizedExpense[], catalog: ExtractionCatalog): ResolvedExpense[] {
    const defaultPerson = findDefaultPerson(catalog)
    const primaryCard = findPrimaryCard(catalog)

    return recognized.map((item) => {
      const transferMethod = item.transfer
        ? matchCatalogEntry(catalog, CatalogKind.PAYMENT_METHOD, item.transfer)
        : null
      const categoryName = item.bankCategory ? BANK_CATEGORIES[normalizeText(item.bankCategory)] : undefined
      const category = categoryName ? matchCatalogEntry(catalog, CatalogKind.CATEGORY, categoryName) : null
      const installment = item.installments ? `1/${item.installments}` : null
      const notes = [
        item.installments
          ? `Total ${item.currency === 'USD' ? 'US$' : 'S/'} ${item.total.toFixed(2)} en ${item.installments} cuotas`
          : null,
        item.pending ? 'En proceso en el banco' : null,
      ]
        .filter(Boolean)
        .join('. ')

      return completeExpense(
        {
          // A Plin or transfer to a person may be an expense, a loan or a payment: the bot asks (D48)
          destination: item.card ? ExpenseDestination.CREDIT_CARD : null,
          description: item.transfer && item.counterpart ? `${item.transfer} a ${item.counterpart}` : item.merchant,
          amount: item.amount,
          currency: item.currency,
          spentAt: item.spentAt,
          expenseType: null,
          installment,
          period: null,
          personId: defaultPerson?.id ?? null,
          paymentMethodId: item.card ? (primaryCard?.id ?? null) : (transferMethod?.id ?? null),
          categoryId: category?.id ?? null,
          merchant: item.counterpart ?? item.merchant,
          operationNumber: null,
          notes: notes || null,
        },
        {
          amount: item.installments ? INSTALLMENT_AMOUNT_CONFIDENCE : TEMPLATE_CONFIDENCE,
          description: TEMPLATE_CONFIDENCE,
          spentAt: TEMPLATE_CONFIDENCE,
        },
        catalog,
      )
    })
  }

  // IO summary by category: what the app says against what Kogane registered with the primary card that month
  async reconcile(
    summary: Extract<RecognitionResult, { screen: RecognizedScreen.IO_CATEGORY_SUMMARY }>,
    catalog: ExtractionCatalog,
  ): Promise<CardReconciliation | null> {
    const card = findPrimaryCard(catalog)
    if (!card) return null

    // "CONSUMO TOTAL EN SEPTIEMBRE" has no year: the latest September up to today
    const today = DateHelper.todayIn(APP_TIME_ZONE)
    const currentYear = Number(today.slice(0, 4))
    const year = summary.month > Number(today.slice(5, 7)) ? currentYear - 1 : currentYear
    const from = new Date(Date.UTC(year, summary.month - 1, 1))
    const to = new Date(Date.UTC(year, summary.month, 1))

    return {
      card: card.name,
      month: summary.month,
      year,
      appTotal: summary.total,
      registered: await this.expenseDBRepository.sumCardExpensesProcessedBetween(card.id, from, to),
      categories: summary.categories,
    }
  }

  async todayStats(): Promise<{ attempts: number; resolved: number }> {
    const since = DateHelper.startOfDayIn(APP_TIME_ZONE)
    const [attempts, resolved] = await Promise.all([
      this.aiRequestLogDBRepository.countSince(AiProvider.LOCAL, OCR_MODEL, since),
      this.aiRequestLogDBRepository.countSince(AiProvider.LOCAL, OCR_MODEL, since, true),
    ])
    return { attempts, resolved }
  }
}
