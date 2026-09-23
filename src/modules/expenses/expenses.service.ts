import { Injectable, Logger } from '@nestjs/common'
import { ZodValidationException } from 'nestjs-zod'

import { Currency } from '@/commons/constants/expense.constant'
import { ExpenseRecordDBRepository, ExpenseResource } from '@/db/models/expense-record/expenseRecordDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { ExpenseListQueryDto } from './dto/request/expenses.dto'
import { EXPENSE_SCHEMAS } from './validations/expenses.validation'

// CRUD of the expense tables for kogane-app (P7). The bot keeps saving through ExpenseSaverService (drafts).
@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name)

  constructor(
    private readonly expenseRecordDBRepository: ExpenseRecordDBRepository,
    private readonly expenseExtractionService: ExpenseExtractionService,
    private readonly storedFilesService: StoredFilesService,
  ) {}

  findMany(resource: ExpenseResource, query: ExpenseListQueryDto) {
    return this.expenseRecordDBRepository.findMany(resource, query)
  }

  findById(resource: ExpenseResource, id: string) {
    return this.expenseRecordDBRepository.findById(resource, id)
  }

  create(resource: ExpenseResource, body: unknown) {
    return this.expenseRecordDBRepository.create(resource, this.withAmountInPen(this.parse(resource, body, false)))
  }

  update(resource: ExpenseResource, id: string, body: unknown) {
    return this.expenseRecordDBRepository.update(resource, id, this.withAmountInPen(this.parse(resource, body, true)))
  }

  // The screenshot of the expense goes too, unless another expense or draft still uses it (D58)
  async delete(resource: ExpenseResource, id: string): Promise<void> {
    const { fileId } = await this.expenseRecordDBRepository.delete(resource, id)
    if (!fileId) return
    try {
      await this.storedFilesService.release(fileId)
    } catch (error) {
      this.logger.warn(`[delete] file ${fileId} not released: ${(error as Error).message}`)
    }
  }

  // "Nuevo gasto": the AI reads a typed or pasted text and the web prefills its form with the result (no draft)
  async extract(text: string) {
    const { expenses } = await this.expenseExtractionService.extract({ text })
    return expenses
  }

  // The body shape depends on the table, so it is validated here instead of with a DTO
  private parse(resource: ExpenseResource, body: unknown, partial: boolean): Record<string, unknown> {
    const schema = partial ? EXPENSE_SCHEMAS[resource].partial() : EXPENSE_SCHEMAS[resource]
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ZodValidationException(parsed.error)
    return parsed.data as Record<string, unknown>
  }

  // Soles need no conversion; other currencies keep amountInPen until an exchange rate is known
  private withAmountInPen(data: Record<string, unknown>) {
    if (data.currency === Currency.PEN && typeof data.amount === 'number') return { ...data, amountInPen: data.amount }
    return data
  }
}
