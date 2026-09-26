import { Injectable, Logger } from '@nestjs/common'

import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { DebtDirection } from '@/commons/constants/debt.constant'
import { Currency, PaymentStatus, RecurringTargetType } from '@/commons/constants/expense.constant'
import { creditCardPaymentPeriod } from '@/commons/helpers/payment-period.helper'
import { JsonHelper } from '@/commons/helpers/json.helper'
import { isDue } from '@/commons/helpers/recurring.helper'
import {
  GeneratedRowDbDto,
  RecurringExpenseDBRepository,
  RecurringWithCard,
} from '@/db/models/recurring-expense/recurringExpenseDB.repository'
import { SharedExpense } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { dayOf } from '@/modules/calendar/calendar.helper'
import { sharesOf } from '@/modules/conversation/shared-expense.parser'

export interface GeneratedRecurring {
  recurringId: string
  id: string // the new row
  targetType: RecurringTargetType
  description: string
  amount: number
  currency: string
  date: string // its day in that month (YYYY-MM-DD)
}

export interface RecurringGeneration {
  month: number
  year: number
  created: GeneratedRecurring[]
  skipped: {
    recurringId: string
    description: string
    reason: 'already_generated' | 'not_due' | 'missing_card' | 'missing_category'
  }[]
}

// Recurrentes → gastos del mes (P20, D88): each active recurring expense becomes a pending row of its table
// ("no iniciado"), due on its day of the month. Run by the job of the 1st at 06:00 and by "Generar" in the web.
@Injectable()
export class RecurringExpensesService {
  private readonly logger = new Logger(RecurringExpensesService.name)

  constructor(private readonly recurringExpenseDBRepository: RecurringExpenseDBRepository) {}

  async generate(month: number, year: number): Promise<RecurringGeneration> {
    const [recurring, defaultCategoryId] = await Promise.all([
      this.recurringExpenseDBRepository.findActive(),
      this.recurringExpenseDBRepository.findDefaultCategoryId(),
    ])
    const monthStart = new Date(Date.UTC(year, month - 1, 1))
    const result: RecurringGeneration = { month, year, created: [], skipped: [] }

    for (const item of recurring) {
      // Monthly ones fall through: the repository already refuses a month generated twice
      if (
        item.lastGeneratedAt &&
        item.lastGeneratedAt < monthStart &&
        !isDue(item.period, item.lastGeneratedAt, monthStart)
      ) {
        result.skipped.push({ recurringId: item.id, description: item.description, reason: 'not_due' })
        continue
      }
      const date = dayOf(year, month, item.dayOfMonth)
      const row = this.rowOf(item, date, month, year, defaultCategoryId)
      if ('reason' in row) {
        result.skipped.push({ recurringId: item.id, description: item.description, reason: row.reason })
        continue
      }

      const id = await this.recurringExpenseDBRepository.generate(item.id, monthStart, row)
      if (!id) {
        result.skipped.push({ recurringId: item.id, description: item.description, reason: 'already_generated' })
        continue
      }
      result.created.push({
        recurringId: item.id,
        id,
        targetType: row.targetType,
        description: item.description,
        amount: item.amount,
        currency: item.currency,
        date,
      })
    }

    if (result.created.length) this.logger.log(`[generate] ${result.created.length} expenses for ${year}-${month}`)
    return result
  }

  // A shared template (D73): the row keeps what others owe and each of them gets their cobro of that month (P30)
  private rowOf(
    item: RecurringWithCard,
    date: string,
    month: number,
    year: number,
    defaultCategoryId: string | null,
  ): GeneratedRowDbDto | { reason: 'missing_card' | 'missing_category' } {
    const row = this.baseRowOf(item, date, month, year, defaultCategoryId)
    const shared = JsonHelper.parseObject<SharedExpense>(item.sharedWith)
    if ('reason' in row || !shared.shares?.length) return row

    const { parts, othersShare } = sharesOf(item.amount, shared)
    const data = row.data as { paymentMonth: number; paymentYear: number; installment?: string | null }
    return {
      ...row,
      data: { ...row.data, othersShare },
      debts: parts
        .filter((part) => part.amount > 0)
        .map((part) => ({
          direction: DebtDirection.OWED_TO_ME,
          description: `${item.description} (compartido)`,
          amount: part.amount,
          currency: item.currency,
          amountInPen: item.currency === Currency.PEN ? part.amount : null,
          personId: part.personId,
          paymentMethodId: item.paymentMethodId,
          paymentMonth: data.paymentMonth,
          paymentYear: data.paymentYear,
          notes: 'Cobro del recurrente compartido',
        })),
    }
  }

  private baseRowOf(
    item: RecurringWithCard,
    date: string,
    month: number,
    year: number,
    defaultCategoryId: string | null,
  ): GeneratedRowDbDto | { reason: 'missing_card' | 'missing_category' } {
    const targetType = item.targetType as RecurringTargetType
    const common = {
      description: item.description,
      amount: item.amount,
      currency: item.currency,
      amountInPen: item.currency === Currency.PEN ? item.amount : null,
      expenseType: item.expenseType,
      personId: item.personId,
      paymentStatus: PaymentStatus.NOT_STARTED,
    }
    const day = new Date(`${date}T00:00:00.000Z`)

    if (targetType === RecurringTargetType.CREDIT_CARD) {
      // A card charge goes to the statement of its day (the card is paid with its statement, no due date of its own)
      if (!item.paymentMethodId || item.paymentMethod?.type !== PaymentMethodType.CREDIT_CARD) {
        return { reason: 'missing_card' }
      }
      return {
        targetType,
        data: {
          ...common,
          categoryId: item.categoryId,
          paymentMethodId: item.paymentMethodId,
          processDate: day,
          ...creditCardPaymentPeriod(date, item.paymentMethod.billingCloseDay ?? 31),
        },
      }
    }

    const period = { paymentMonth: month, paymentYear: year, dueDate: day, paymentMethodId: item.paymentMethodId }
    if (targetType === RecurringTargetType.SUBSCRIPTION) {
      return {
        targetType,
        data: {
          ...common,
          ...period,
          categoryId: item.categoryId,
          period: item.period,
          kind: item.kind,
          supplyNumber: item.supplyNumber,
        },
      }
    }

    // Fixed costs need a category: the recurring one or the default category of the catalog
    const categoryId = item.categoryId ?? defaultCategoryId
    if (!categoryId) return { reason: 'missing_category' }
    return { targetType, data: { ...common, ...period, categoryId } }
  }
}
