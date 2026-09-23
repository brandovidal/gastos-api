import { Injectable, Logger } from '@nestjs/common'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { DEBT_DIRECTION_BY_DESTINATION, DebtDirection } from '@/commons/constants/debt.constant'
import {
  Currency,
  ExpenseDestination,
  ExpenseType,
  INSTALLMENT_REGEX,
  PaymentStatus,
} from '@/commons/constants/expense.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import {
  addMonths,
  creditCardPaymentPeriod,
  PaymentPeriod,
  paymentPeriodOf,
} from '@/commons/helpers/payment-period.helper'
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
      case ExpenseDestination.PAYABLE: {
        const direction = DEBT_DIRECTION_BY_DESTINATION[destination] as DebtDirection
        return this.buildDebt(
          expenseDraft,
          destination,
          { ...base, direction },
          await this.debtPeriod(expenseDraft, spentAtIso),
        )
      }
      default:
        throw new ExpenseNotSaveableException({ draftId: expenseDraft.id, destination })
    }
  }

  // One row per installment (D60). "1/n" creates the n installments, one per month; "3/6" only that one (the
  // others were registered before). The amount is always the installment's.
  private buildDebt(
    expenseDraft: ExpenseDraftDbDto,
    destination: ExpenseDestination.RECEIVABLE | ExpenseDestination.PAYABLE,
    base: { direction: DebtDirection; description: string; amount: number; personId: string } & Record<string, unknown>,
    period: PaymentPeriod,
  ): SaveExpenseDbDto {
    const installment =
      expenseDraft.installment && INSTALLMENT_REGEX.test(expenseDraft.installment) ? expenseDraft.installment : null
    const [current, total] = installment ? installment.split('/').map(Number) : [0, 0]
    const data = { ...base, installment, ...period }

    const nextInstallments =
      current === 1 && total > 1
        ? Array.from({ length: total - 1 }, (_, index) => ({
            ...data,
            installment: `${index + 2}/${total}`,
            ...addMonths(period, index + 1),
          }))
        : []

    return { destination, data, nextInstallments }
  }

  // Something bought with a credit card for someone is paid back in the card's billing month (D22); otherwise now
  private async debtPeriod(expenseDraft: ExpenseDraftDbDto, spentAtIso: string): Promise<PaymentPeriod> {
    if (!expenseDraft.paymentMethodId) return paymentPeriodOf(spentAtIso)
    const method = await this.paymentMethodDBRepository.findById(expenseDraft.paymentMethodId)
    return method?.type === PaymentMethodType.CREDIT_CARD && method.billingCloseDay
      ? creditCardPaymentPeriod(spentAtIso, method.billingCloseDay)
      : paymentPeriodOf(spentAtIso)
  }

  private required<T>(expenseDraft: ExpenseDraftDbDto, value: T | null | undefined): T {
    if (value == null) {
      throw new ExpenseNotSaveableException({ draftId: expenseDraft.id })
    }
    return value
  }
}
