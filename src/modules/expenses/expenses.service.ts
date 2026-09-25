import { Injectable, Logger } from '@nestjs/common'
import { ZodValidationException } from 'nestjs-zod'

import { Currency, PaymentStatus } from '@/commons/constants/expense.constant'
import { ExpenseRecordDBRepository, ExpenseResource } from '@/db/models/expense-record/expenseRecordDB.repository'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { ExpenseListQueryDto } from './dto/request/expenses.dto'
import { EXPENSE_SCHEMAS } from './validations/expenses.validation'

// Tables with a payment status (day to day has none; templates are not expenses)
const RESOURCES_WITH_STATUS: ExpenseResource[] = [
  ExpenseResource.FIXED_COST,
  ExpenseResource.SUBSCRIPTION,
  ExpenseResource.CREDIT_CARD,
]

// CRUD of the expense tables for kogane-app (P7). The bot keeps saving through ExpenseSaverService (drafts).
@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name)

  constructor(
    private readonly expenseRecordDBRepository: ExpenseRecordDBRepository,
    private readonly storedFilesService: StoredFilesService,
  ) {}

  findMany(resource: ExpenseResource, query: ExpenseListQueryDto) {
    return this.expenseRecordDBRepository.findMany(resource, query)
  }

  findById(resource: ExpenseResource, id: string) {
    return this.expenseRecordDBRepository.findById(resource, id)
  }

  create(resource: ExpenseResource, body: unknown) {
    const data = this.parse(resource, body, false)
    // Every new row starts "No iniciado"; exp_credit_card_expenses still defaults to pending in the database
    if (RESOURCES_WITH_STATUS.includes(resource) && data.paymentStatus === undefined) {
      data.paymentStatus = PaymentStatus.NOT_STARTED
    }
    return this.expenseRecordDBRepository.create(resource, this.withAmountInPen(resource, data))
  }

  update(resource: ExpenseResource, id: string, body: unknown) {
    return this.expenseRecordDBRepository.update(
      resource,
      id,
      this.withAmountInPen(resource, this.parse(resource, body, true)),
    )
  }

  async delete(resource: ExpenseResource, id: string): Promise<void> {
    const { fileId } = await this.expenseRecordDBRepository.delete(resource, id)
    if (!fileId) return
    try {
      await this.storedFilesService.release(fileId)
    } catch (error) {
      this.logger.warn(`[delete] file ${fileId} not released: ${(error as Error).message}`)
    }
  }

  private parse(resource: ExpenseResource, body: unknown, partial: boolean): Record<string, unknown> {
    const schema = partial ? EXPENSE_SCHEMAS[resource].partial() : EXPENSE_SCHEMAS[resource]
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ZodValidationException(parsed.error)
    return parsed.data as Record<string, unknown>
  }

  // Recurring templates have no amountInPen: only the rows they generate do
  private withAmountInPen(resource: ExpenseResource, data: Record<string, unknown>) {
    if (resource === ExpenseResource.RECURRING) return data
    if (data.currency === Currency.PEN && typeof data.amount === 'number') return { ...data, amountInPen: data.amount }
    return data
  }
}
