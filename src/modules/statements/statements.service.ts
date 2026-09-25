import { Injectable, Logger } from '@nestjs/common'

import { AiOperation } from '@/commons/constants/ai.constant'
import { toCents } from '@/commons/constants/debt.constant'
import { Currency, PaymentStatus } from '@/commons/constants/expense.constant'
import { NotificationKind, NotificationRefType } from '@/commons/constants/notification.constant'
import { StatementRowResult, StatementSource, StatementStatus } from '@/commons/constants/statement.constant'
import { StatementUnreadableException } from '@/commons/exceptions/statement/statement-unreadable.exception'
import { addMonths, PaymentPeriod } from '@/commons/helpers/payment-period.helper'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'
import { StatementDBRepository } from '@/db/models/statement/statementDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { NotificationsService } from '@/modules/notifications/notifications.service'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'
import { MONTH_NAMES } from '@/modules/conversation/conversation.messages'

import { readPdfLines } from './statement-pdf.reader'
import { detectCardHint, maskForAi, ParsedStatement, parseStatementLines, templateAddsUp } from './statement.parser'
import { fromAi, STATEMENT_INSTRUCTIONS, statementAiJsonSchema, statementAiSchema } from './statement.prompt'
import { CardExpenseForMatch, reconcileStatement } from './statement.reconcile'

export interface StatementUpload {
  data: Buffer
  password?: string | null // when the saved document number does not open it
  paymentMethodId?: string | null // when the text does not say which card
}

const day = (isoDay: string | null) => (isoDay ? new Date(`${isoDay}T00:00:00.000Z`) : null)
const isoOf = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null)
const periodOfDay = (isoDay: string): PaymentPeriod => ({
  paymentMonth: Number(isoDay.slice(5, 7)),
  paymentYear: Number(isoDay.slice(0, 4)),
})

// Bank statements (P14 block 2, D95): the PDF is opened with the owner's document number (D94), read by a template
// or the AI (only its text), saved row by row and reconciled with the card expenses of its payment month
@Injectable()
export class StatementsService {
  private readonly logger = new Logger(StatementsService.name)

  constructor(
    private readonly statementDBRepository: StatementDBRepository,
    private readonly paymentMethodDBRepository: PaymentMethodDBRepository,
    private readonly personDBRepository: PersonDBRepository,
    private readonly expenseExtractionService: ExpenseExtractionService,
    private readonly storedFilesService: StoredFilesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async upload({ data, password, paymentMethodId }: StatementUpload) {
    const owner = await this.personDBRepository.findDefault()
    const lines = await readPdfLines(data, password || owner?.documentNumber)
    const { parsed, source } = await this.read(lines, owner?.documentNumber ?? null)

    const card = await this.cardOf(paymentMethodId ?? null, parsed.cardHint)
    const period = this.periodOf(parsed, card)
    const expenses = await this.cardExpenses(card.id, period)
    const { rows } = reconcileStatement(parsed.rows, expenses)

    const fileId = await this.keepFile(data)
    const statement = await this.statementDBRepository.create({
      paymentMethodId: card.id,
      ...period,
      periodEnd: day(parsed.periodEnd),
      dueDate: day(parsed.dueDate),
      totalDue: parsed.totalDue,
      minimumDue: parsed.minimumDue,
      currency: parsed.currency,
      source,
      fileId,
      status: rows.some((row) => row.result === StatementRowResult.NEW) ? StatementStatus.REVIEW : StatementStatus.DONE,
      rows: rows.map((row) => ({
        date: day(row.date),
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        installment: row.installment,
        result: row.result,
        expenseId: row.expenseId,
      })),
    })

    const view = await this.get(statement.id)
    await this.notify(view).catch((error: Error) => this.logger.warn(`[upload] notice not sent: ${error.message}`))
    return view
  }

  // The statement with its rows, the card expenses of the month that are not in it, and both totals
  async get(id: string) {
    const statement = await this.statementDBRepository.findById(id)
    const period = { paymentMonth: statement.paymentMonth, paymentYear: statement.paymentYear }
    const [expenses, card] = await Promise.all([
      this.cardExpenses(statement.paymentMethodId, period),
      this.paymentMethodDBRepository.findById(statement.paymentMethodId),
    ])
    const linked = new Set(statement.rows.map((row) => row.expenseId).filter(Boolean))
    const koganeTotal = toCents(expenses.reduce((sum, expense) => sum + expense.amount, 0))
    return {
      ...statement,
      cardName: card?.name ?? '',
      missing: expenses.filter((expense) => !linked.has(expense.id)),
      koganeTotal,
      difference: statement.totalDue == null ? null : toCents(statement.totalDue - koganeTotal),
    }
  }

  async list() {
    const [statements, cards] = await Promise.all([
      this.statementDBRepository.findMany(),
      this.paymentMethodDBRepository.findAll(),
    ])
    const names = new Map(cards.map((card) => [card.id, card.name]))
    return statements.map(({ rows, ...statement }) => ({
      ...statement,
      cardName: names.get(statement.paymentMethodId) ?? '',
      counts: {
        matched: rows.filter((row) => row.result === StatementRowResult.MATCHED).length,
        new: rows.filter((row) => row.result === StatementRowResult.NEW).length,
        created: rows.filter((row) => row.result === StatementRowResult.CREATED).length,
        ignored: rows.filter((row) => row.result === StatementRowResult.IGNORED).length,
      },
    }))
  }

  // ➕ Crear: the new rows (all or the given ones) become pending card expenses of the statement month
  async createNew(id: string, rowIds?: string[]) {
    const statement = await this.statementDBRepository.findById(id)
    const owner = await this.personDBRepository.findDefault()
    if (!owner) throw new StatementUnreadableException({ reason: 'no default person' })
    // "Crear todos" takes the new rows; a row chosen by hand is created anyway (matched with an expense of the same
    // name from another month or card, or ignored), but never twice
    const rows = statement.rows.filter((row) =>
      rowIds?.length
        ? rowIds.includes(row.id) && row.result !== StatementRowResult.CREATED
        : row.result === StatementRowResult.NEW,
    )
    await this.statementDBRepository.createExpenses(
      id,
      rows.map((row) => ({
        id: row.id,
        data: {
          description: row.label || row.description,
          amount: row.amount,
          currency: row.currency,
          amountInPen: row.currency === Currency.PEN ? row.amount : null,
          paymentStatus: PaymentStatus.PENDING,
          personId: owner.id,
          paymentMethodId: statement.paymentMethodId,
          installment: row.installment,
          paymentMonth: statement.paymentMonth,
          paymentYear: statement.paymentYear,
          processDate: row.date,
          notes: row.label ? `Del estado de cuenta: ${row.description}` : 'Del estado de cuenta',
        },
      })),
    )
    return this.get(id)
  }

  async updateRow(
    id: string,
    rowId: string,
    { result, label }: { result?: StatementRowResult.IGNORED | StatementRowResult.NEW; label?: string | null },
  ) {
    await this.statementDBRepository.updateRow(id, rowId, {
      result,
      label: label === undefined ? undefined : label || null,
    })
    return this.get(id)
  }

  delete(id: string) {
    return this.statementDBRepository.delete(id)
  }

  // Template first; the AI reads the masked text when the template does not add up to the total
  private async read(lines: string[], documentNumber: string | null) {
    const parsed = parseStatementLines(lines)
    if (templateAddsUp(parsed)) return { parsed, source: StatementSource.TEMPLATE }

    const output = await this.expenseExtractionService.generateStructured({
      instructions: STATEMENT_INSTRUCTIONS,
      text: maskForAi(lines, documentNumber),
      jsonSchema: statementAiJsonSchema,
      parse: (json) => {
        const result = statementAiSchema.safeParse(json)
        return result.success ? { success: true, data: result.data } : { success: false, error: result.error.message }
      },
      operation: AiOperation.STATEMENT,
    })
    if (output?.movements.length) {
      return {
        parsed: fromAi(output, parsed.cardHint ?? detectCardHint(output.cardName ?? '')),
        source: StatementSource.AI,
      }
    }
    if (parsed.rows.length) return { parsed, source: StatementSource.TEMPLATE }
    throw new StatementUnreadableException({ reason: 'no movements' })
  }

  private async cardOf(paymentMethodId: string | null, hint: string | null) {
    const cards = (await this.paymentMethodDBRepository.findAll()).filter((method) => method.type === 'credit_card')
    const card = paymentMethodId
      ? cards.find((candidate) => candidate.id === paymentMethodId)
      : cards.find((candidate) => candidate.code === hint)
    if (!card) throw new StatementUnreadableException({ reason: 'card not found: choose it' })
    return card
  }

  // The statement of month M closes on the closing day of M: its period end says M; without it, the due date (paid
  // in M when the due day comes after the closing day, otherwise in M+1)
  private periodOf(parsed: ParsedStatement, card: { billingCloseDay: number | null; paymentDueDay: number | null }) {
    if (parsed.periodEnd) return periodOfDay(parsed.periodEnd)
    if (parsed.dueDate) {
      const due = periodOfDay(parsed.dueDate)
      const sameMonth = (card.paymentDueDay ?? 0) > (card.billingCloseDay ?? 31)
      return sameMonth ? due : addMonths(due, -1)
    }
    throw new StatementUnreadableException({ reason: 'no closing or due date' })
  }

  private async cardExpenses(paymentMethodId: string, period: PaymentPeriod): Promise<CardExpenseForMatch[]> {
    const expenses = await this.statementDBRepository.findCardExpenses(paymentMethodId, period)
    return expenses.map((expense) => ({ ...expense, processDate: isoOf(expense.processDate) }))
  }

  private async keepFile(data: Buffer): Promise<string | null> {
    try {
      const file = await this.storedFilesService.storeTemporary('web', data, 'application/pdf')
      await this.storedFilesService.keep(file.id)
      return file.id
    } catch (error) {
      this.logger.warn(`[keepFile] statement PDF not stored: ${(error as Error).message}`)
      return null
    }
  }

  private notify(view: Awaited<ReturnType<StatementsService['get']>>) {
    const count = (result: StatementRowResult) => view.rows.filter((row) => row.result === result).length
    const month = `${MONTH_NAMES[view.paymentMonth - 1]} ${view.paymentYear}`
    const total =
      view.difference == null
        ? ''
        : Math.abs(view.difference) < 0.01
          ? ' El total cuadra ✅'
          : ` Diferencia con lo registrado: S/ ${view.difference.toFixed(2)}.`
    return this.notificationsService.notify({
      kind: NotificationKind.STATEMENT,
      title: `📄 Estado de cuenta ${view.cardName} · ${month}`,
      body: `${count(StatementRowResult.MATCHED)} ya registrados, ${count(StatementRowResult.NEW)} nuevos y ${view.missing.length} solo en Kogane.${total} Revísalo en Estados de cuenta.`,
      amount: view.totalDue,
      refType: NotificationRefType.STATEMENT,
      refId: view.id,
      eventDate: view.dueDate,
      dedupeKey: `statement:${view.id}`,
    })
  }
}
