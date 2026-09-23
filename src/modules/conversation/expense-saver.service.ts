import { Injectable, Logger } from '@nestjs/common'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import { Currency, ExpenseDestination, ExpenseType, PaymentStatus } from '@/commons/constants/expense.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { creditCardPaymentPeriod, paymentPeriodOf } from '@/commons/helpers/payment-period.helper'
import { ExpenseNotSaveableException } from '@/commons/exceptions/conversation/expense-not-saveable.exception'
import { ExpenseDraftDbDto } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { SaveExpenseDbDto } from '@/db/models/expense/expenseDB.dto'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

// Turns a confirmed ExpenseDraft into a record of its destination table (✅ Guardar)
@Injectable()
export class ExpenseSaverService {
  private readonly logger = new Logger(ExpenseSaverService.name)

  constructor(
    private readonly expenseDBRepository: ExpenseDBRepository,
    private readonly paymentMethodDBRepository: PaymentMethodDBRepository,
    private readonly storedFilesService: StoredFilesService,
  ) {}

  async save(expenseDraft: ExpenseDraftDbDto): Promise<{ id: string }> {
    this.assertComplete(expenseDraft)

    const input = await this.buildInput(expenseDraft)
    const saved = await this.expenseDBRepository.saveFromExpenseDraft(expenseDraft.id, input)
    await this.keepFile(expenseDraft.fileId)
    return saved
  }

  // The screenshot of a saved expense moves out of drafts (D58). The expense is already saved: a failure only logs
  private async keepFile(fileId: string | null) {
    if (!fileId) return
    try {
      await this.storedFilesService.keep(fileId)
    } catch (error) {
      this.logger.warn(`[keepFile] file ${fileId} not kept: ${(error as Error).message}`)
    }
  }

  private assertComplete({ id, missingFields, destination, description, amount, personId }: ExpenseDraftDbDto) {
    if (missingFields.length || !destination || !description || amount == null || !personId) {
      throw new ExpenseNotSaveableException({ draftId: id, missingFields })
    }
  }

  private async buildInput(expenseDraft: ExpenseDraftDbDto): Promise<SaveExpenseDbDto> {
    const { destination } = expenseDraft
    const description = expenseDraft.description as string
    const amount = expenseDraft.amount as number
    const personId = expenseDraft.personId as string

    const currency = expenseDraft.currency ?? Currency.PEN
    const spentAt = expenseDraft.spentAt ?? new Date(`${DateHelper.todayIn(APP_TIME_ZONE)}T00:00:00.000Z`)
    const spentAtIso = spentAt.toISOString().slice(0, 10)

    const base = {
      description,
      amount,
      currency,
      exchangeRate: expenseDraft.exchangeRate,
      amountInPen: currency === Currency.PEN ? amount : null,
      personId,
      notes: expenseDraft.notes,
    }
    const expense = {
      ...base,
      expenseType: expenseDraft.expenseType ?? ExpenseType.ESSENTIAL,
      categoryId: expenseDraft.categoryId,
      installment: expenseDraft.installment,
    }

    switch (destination) {
      case ExpenseDestination.DAILY:
        return {
          destination,
          data: {
            ...base,
            expenseType: expenseDraft.expenseType ?? ExpenseType.ESSENTIAL,
            paymentMethodId: this.required(expenseDraft, expenseDraft.paymentMethodId),
            categoryId: expenseDraft.categoryId,
            spentAt,
            merchant: expenseDraft.merchant,
            operationNumber: expenseDraft.operationNumber,
          },
        }
      case ExpenseDestination.FIXED_COST:
        return {
          destination,
          data: {
            ...expense,
            categoryId: this.required(expenseDraft, expenseDraft.categoryId),
            paymentMethodId: expenseDraft.paymentMethodId,
            paymentStatus: PaymentStatus.NOT_STARTED,
            paymentDate: spentAt,
            ...paymentPeriodOf(spentAtIso),
          },
        }
      case ExpenseDestination.SUBSCRIPTION:
        return {
          destination,
          data: {
            ...expense,
            period: this.required(expenseDraft, expenseDraft.period),
            paymentMethodId: expenseDraft.paymentMethodId,
            paymentStatus: PaymentStatus.NOT_STARTED,
            paymentDate: spentAt,
            ...paymentPeriodOf(spentAtIso),
          },
        }
      case ExpenseDestination.CREDIT_CARD: {
        const paymentMethodId = this.required(expenseDraft, expenseDraft.paymentMethodId)
        const card = this.required(expenseDraft, await this.paymentMethodDBRepository.findById(paymentMethodId))
        // A card without closing day (e.g. just created from the bot) is billed in the month of the purchase
        const period = card.billingCloseDay
          ? creditCardPaymentPeriod(spentAtIso, card.billingCloseDay)
          : paymentPeriodOf(spentAtIso)
        return {
          destination,
          data: {
            ...expense,
            paymentMethodId,
            paymentStatus: PaymentStatus.PENDING,
            processDate: spentAt,
            ...period,
          },
        }
      }
      case ExpenseDestination.RECEIVABLE:
        return { destination, data: base }
      default:
        throw new ExpenseNotSaveableException({ draftId: expenseDraft.id, destination })
    }
  }

  private required<T>(expenseDraft: ExpenseDraftDbDto, value: T | null | undefined): T {
    if (value == null) {
      throw new ExpenseNotSaveableException({ draftId: expenseDraft.id })
    }
    return value
  }
}
