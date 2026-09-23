import { Injectable } from '@nestjs/common'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import { Currency, ExpenseDestination, ExpenseType, PaymentStatus } from '@/commons/constants/expense.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { creditCardPaymentPeriod, paymentPeriodOf } from '@/commons/helpers/payment-period.helper'
import { ExpenseNotSaveableException } from '@/commons/exceptions/conversation/expense-not-saveable.exception'
import { ExpenseFileDbDto } from '@/db/models/expense-file/expenseFileDB.dto'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { SaveExpenseDbDto } from '@/db/models/expense/expenseDB.dto'
import { CreditCardDBRepository } from '@/db/models/credit-card/creditCardDB.repository'

// Turns a confirmed ExpenseFile into a record of its destination table (✅ Guardar)
@Injectable()
export class ExpenseSaverService {
  constructor(
    private readonly expenseDBRepository: ExpenseDBRepository,
    private readonly creditCardDBRepository: CreditCardDBRepository,
  ) {}

  async save(expenseFile: ExpenseFileDbDto): Promise<{ id: string }> {
    const input = await this.buildInput(expenseFile)
    return this.expenseDBRepository.saveFromExpenseFile(expenseFile.id, input)
  }

  private async buildInput(expenseFile: ExpenseFileDbDto): Promise<SaveExpenseDbDto> {
    const { destination, description, amount, personId } = expenseFile

    if (expenseFile.missingFields.length || !destination || !description || amount == null || !personId) {
      throw new ExpenseNotSaveableException({ expenseFileId: expenseFile.id, missingFields: expenseFile.missingFields })
    }

    const currency = expenseFile.currency ?? Currency.PEN
    const spentAt = expenseFile.spentAt ?? new Date(`${DateHelper.todayIn(APP_TIME_ZONE)}T00:00:00.000Z`)
    const spentAtIso = spentAt.toISOString().slice(0, 10)

    const base = {
      description,
      amount,
      currency,
      exchangeRate: expenseFile.exchangeRate,
      amountInPen: currency === Currency.PEN ? amount : null,
      personId,
      notes: expenseFile.notes,
    }
    const expense = {
      ...base,
      expenseType: expenseFile.expenseType ?? ExpenseType.ESSENTIAL,
      categoryId: expenseFile.categoryId,
      installment: expenseFile.installment,
    }

    switch (destination) {
      case ExpenseDestination.FIXED_COST:
        return {
          destination,
          data: {
            ...expense,
            categoryId: this.required(expenseFile, expenseFile.categoryId),
            paymentMethodId: expenseFile.paymentMethodId,
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
            period: this.required(expenseFile, expenseFile.period),
            paymentMethodId: expenseFile.paymentMethodId,
            paymentStatus: PaymentStatus.NOT_STARTED,
            paymentDate: spentAt,
            ...paymentPeriodOf(spentAtIso),
          },
        }
      case ExpenseDestination.CREDIT_CARD: {
        const creditCardId = this.required(expenseFile, expenseFile.creditCardId)
        const creditCard = this.required(expenseFile, await this.creditCardDBRepository.findById(creditCardId))
        return {
          destination,
          data: {
            ...expense,
            creditCardId,
            paymentStatus: PaymentStatus.PENDING,
            processDate: spentAt,
            ...creditCardPaymentPeriod(spentAtIso, creditCard.billingCloseDay),
          },
        }
      }
      case ExpenseDestination.RECEIVABLE:
        return { destination, data: base }
      default:
        throw new ExpenseNotSaveableException({ expenseFileId: expenseFile.id, destination })
    }
  }

  private required<T>(expenseFile: ExpenseFileDbDto, value: T | null | undefined): T {
    if (value == null) {
      throw new ExpenseNotSaveableException({ expenseFileId: expenseFile.id })
    }
    return value
  }
}
