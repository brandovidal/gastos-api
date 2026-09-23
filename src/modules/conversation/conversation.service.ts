import { Injectable, Logger } from '@nestjs/common'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import {
  BotAction,
  BotCommand,
  ChannelMessageType,
  FREE_CORRECTION_FIELD,
  RECENT_EXPENSES_LIMIT,
} from '@/commons/constants/conversation.constant'
import { ExpenseDestination, SubscriptionPeriod } from '@/commons/constants/expense.constant'
import {
  EXPENSE_FILE_EXPIRATION_MINUTES,
  ExpenseFileInputType,
  ExpenseFileStatus,
  OPEN_EXPENSE_FILE_STATUSES,
} from '@/commons/constants/expense-file.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { DuplicateExpenseFileException } from '@/commons/exceptions/expense-file/duplicate-expense-file.exception'
import { ExpenseFileDBRepository } from '@/db/models/expense-file/expenseFileDB.repository'
import { ExpenseFileDbDto } from '@/db/models/expense-file/expenseFileDB.dto'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { completeExpense } from '@/modules/expense-extraction/expense-extraction.resolver'
import { findCatalogEntryById } from '@/modules/expense-extraction/expense-extraction.catalog'
import {
  ExtractionCatalog,
  ResolvedExpense,
  ResolvedExpenseFields,
} from '@/modules/expense-extraction/dto/expense-extraction.types'

import { ExpenseSaverService } from './expense-saver.service'
import { toExpenseFields, toExpenseFileUpdate } from './expense-file.mapper'
import {
  DESTINATION_LABELS,
  TEXTS,
  buildClosedReply,
  buildExpenseReply,
  formatMonthlyTotals,
  formatRecent,
} from './conversation.messages'
import { BotActionPayload, BotReply, ChannelMessage, ConversationResult } from './dto/conversation.types'

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'setiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

// Channel-agnostic conversation: one ExpenseFile per expense, one question at a time, confirm with buttons
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name)

  constructor(
    private readonly expenseFileDBRepository: ExpenseFileDBRepository,
    private readonly expenseDBRepository: ExpenseDBRepository,
    private readonly expenseExtractionService: ExpenseExtractionService,
    private readonly expenseSaverService: ExpenseSaverService,
  ) {}

  async handle(message: ChannelMessage): Promise<ConversationResult> {
    switch (message.type) {
      case ChannelMessageType.COMMAND:
        return { replies: await this.handleCommand(message) }
      case ChannelMessageType.ACTION:
        return this.handleAction(message)
      default:
        return { replies: await this.handleText(message) }
    }
  }

  private async handleText(message: ChannelMessage): Promise<BotReply[]> {
    const text = message.text?.trim()
    if (!text) return []

    const active = await this.findActive(message)

    if (active) {
      if (active.pendingField === FREE_CORRECTION_FIELD) {
        return [await this.correctWithAi(active, text)]
      }

      // Answer to the pending question, or a correction that starts with a keyword ("monto 30")
      const correction = await this.expenseExtractionService.parseLocalCorrection(
        text,
        active.pendingField as ExpenseField | null,
      )

      if (correction) {
        return [await this.applyCorrection(active, correction)]
      }
    }

    return this.registerNewExpenses(message, text)
  }

  private async registerNewExpenses(message: ChannelMessage, text: string): Promise<BotReply[]> {
    let expenseFile: ExpenseFileDbDto

    try {
      expenseFile = await this.expenseFileDBRepository.create({
        channel: message.channel,
        chatId: message.chatId,
        messageId: message.messageId,
        inputType: ExpenseFileInputType.TEXT,
        rawText: text,
      })
    } catch (error) {
      // Webhook retry of a message already handled
      if (error instanceof DuplicateExpenseFileException) return []
      throw error
    }

    let expenses: ResolvedExpense[]

    try {
      ;({ expenses } = await this.expenseExtractionService.extract({ text, expenseFileId: expenseFile.id }))
    } catch (error) {
      this.logger.warn(`[registerNewExpenses] extraction failed: ${(error as Error).message}`)
      await this.expenseFileDBRepository.update(expenseFile.id, { status: ExpenseFileStatus.FAILED })
      return [{ text: TEXTS.failed }]
    }

    if (!expenses.length) {
      await this.expenseFileDBRepository.update(expenseFile.id, { status: ExpenseFileStatus.DISCARDED })
      return [{ text: TEXTS.notAnExpense }]
    }

    const catalog = await this.expenseExtractionService.loadCatalog()
    const replies: BotReply[] = []

    for (const [index, expense] of expenses.entries()) {
      const target =
        index === 0
          ? expenseFile
          : await this.expenseFileDBRepository.create({
              channel: message.channel,
              chatId: message.chatId,
              messageId: message.messageId,
              itemIndex: index,
              inputType: ExpenseFileInputType.TEXT,
              rawText: text,
            })

      const updated = await this.expenseFileDBRepository.update(target.id, toExpenseFileUpdate(expense))
      replies.push(this.replyFor(updated, catalog))
    }

    return replies
  }

  private async applyCorrection(
    expenseFile: ExpenseFileDbDto,
    correction: Partial<ResolvedExpenseFields>,
    edit = false,
  ): Promise<BotReply> {
    // What the user says is certain: corrected fields lose their ❓
    const confidence = { ...expenseFile.confidence }
    for (const field of Object.keys(correction)) confidence[field] = 1

    const expense = completeExpense({ ...toExpenseFields(expenseFile), ...correction }, confidence)
    const updated = await this.expenseFileDBRepository.update(expenseFile.id, toExpenseFileUpdate(expense))

    return this.replyFor(updated, await this.expenseExtractionService.loadCatalog(), edit)
  }

  private async correctWithAi(expenseFile: ExpenseFileDbDto, text: string): Promise<BotReply> {
    try {
      const { expenses } = await this.expenseExtractionService.extract({
        text,
        draft: toExpenseFields(expenseFile),
        expenseFileId: expenseFile.id,
      })

      if (expenses[0]) {
        const updated = await this.expenseFileDBRepository.update(expenseFile.id, toExpenseFileUpdate(expenses[0]))
        return this.replyFor(updated, await this.expenseExtractionService.loadCatalog())
      }
    } catch (error) {
      this.logger.warn(`[correctWithAi] extraction failed: ${(error as Error).message}`)
    }

    // Leave correction mode so the next message is handled normally
    await this.expenseFileDBRepository.update(expenseFile.id, { pendingField: expenseFile.missingFields[0] ?? null })
    return { text: TEXTS.correctionFailed }
  }

  private async handleAction(message: ChannelMessage): Promise<ConversationResult> {
    const action = message.action as BotActionPayload
    const expenseFile = await this.expenseFileDBRepository.findById(action.expenseFileId)

    const isOwnOpenFile =
      expenseFile &&
      expenseFile.chatId === message.chatId &&
      OPEN_EXPENSE_FILE_STATUSES.includes(expenseFile.status as ExpenseFileStatus)

    if (!expenseFile || !isOwnOpenFile) {
      return { replies: [], notice: TEXTS.alreadyProcessed }
    }

    const catalog = await this.expenseExtractionService.loadCatalog()

    switch (action.name) {
      case BotAction.SAVE: {
        if (expenseFile.missingFields.length) {
          return { replies: [this.replyFor(expenseFile, catalog, true)] }
        }
        await this.expenseSaverService.save(expenseFile)
        const saved = { ...expenseFile, status: ExpenseFileStatus.SAVED }
        const label = DESTINATION_LABELS[expenseFile.destination as ExpenseDestination]
        return { replies: [buildClosedReply(`✅ <b>Guardado en ${label}</b>`, saved, catalog)], notice: TEXTS.saved }
      }
      case BotAction.EDIT:
        await this.expenseFileDBRepository.update(expenseFile.id, { pendingField: FREE_CORRECTION_FIELD })
        return { replies: [{ text: TEXTS.askCorrection }] }
      case BotAction.INBOX: {
        const updated = await this.expenseFileDBRepository.update(expenseFile.id, {
          status: ExpenseFileStatus.INBOX,
          pendingField: null,
        })
        return { replies: [buildClosedReply('📥 <b>En la bandeja</b>', updated, catalog)] }
      }
      case BotAction.DISCARD: {
        const updated = await this.expenseFileDBRepository.update(expenseFile.id, {
          status: ExpenseFileStatus.DISCARDED,
          pendingField: null,
        })
        return { replies: [buildClosedReply('❌ <b>Descartado</b>', updated, catalog)] }
      }
      case BotAction.SET_FIELD: {
        const correction = this.toFieldCorrection(action, catalog)
        if (!correction) return { replies: [], notice: TEXTS.alreadyProcessed }
        return { replies: [await this.applyCorrection(expenseFile, correction, true)] }
      }
      default:
        return { replies: [] }
    }
  }

  // Values from quick reply buttons are checked again: the button may be older than the catalog
  private toFieldCorrection(
    { field, value }: BotActionPayload,
    catalog: ExtractionCatalog,
  ): Partial<ResolvedExpenseFields> | null {
    if (!field || !value) return null

    switch (field) {
      case ExpenseField.DESTINATION:
        return (Object.values(ExpenseDestination) as string[]).includes(value) ? { destination: value } : null
      case ExpenseField.PERIOD:
        return (Object.values(SubscriptionPeriod) as string[]).includes(value) ? { period: value } : null
      case ExpenseField.PAYMENT_METHOD: {
        const method = findCatalogEntryById(catalog, value)
        return method
          ? { paymentMethodId: method.id, ...(method.creditCardId && { creditCardId: method.creditCardId }) }
          : null
      }
      case ExpenseField.CREDIT_CARD:
      case ExpenseField.CATEGORY:
      case ExpenseField.PERSON:
        return findCatalogEntryById(catalog, value) ? { [field]: value } : null
      default:
        return null
    }
  }

  private async handleCommand(message: ChannelMessage): Promise<BotReply[]> {
    switch (message.command) {
      case BotCommand.CANCEL: {
        const count = await this.expenseFileDBRepository.discardOpenByChat(message.channel, message.chatId)
        return [{ text: TEXTS.cancelled(count) }]
      }
      case BotCommand.RECENT: {
        const recent = await this.expenseFileDBRepository.findRecentSaved(
          message.channel,
          message.chatId,
          RECENT_EXPENSES_LIMIT,
        )
        return [{ text: formatRecent(recent) }]
      }
      case BotCommand.SUMMARY: {
        const today = DateHelper.todayIn(APP_TIME_ZONE)
        const month = Number(today.slice(5, 7))
        const year = Number(today.slice(0, 4))
        const [totals, catalog] = await Promise.all([
          this.expenseDBRepository.findMonthlyTotals(month, year),
          this.expenseExtractionService.loadCatalog(),
        ])
        return [{ text: formatMonthlyTotals(totals, catalog, `${MONTH_NAMES[month - 1]} ${year}`) }]
      }
      default:
        return [{ text: TEXTS.help }]
    }
  }

  // The latest open expense file is the one text corrections apply to; stale ones are discarded first
  private async findActive(message: ChannelMessage): Promise<ExpenseFileDbDto | null> {
    const cutoff = new Date(Date.now() - EXPENSE_FILE_EXPIRATION_MINUTES * 60_000)
    await this.expenseFileDBRepository.discardOpenUpdatedBefore(message.channel, message.chatId, cutoff)
    return this.expenseFileDBRepository.findOpenByChat(message.channel, message.chatId, cutoff)
  }

  private replyFor(expenseFile: ExpenseFileDbDto, catalog: ExtractionCatalog, edit = false): BotReply {
    if (expenseFile.status === ExpenseFileStatus.DISCARDED) {
      return { text: TEXTS.notAnExpense, edit }
    }
    return buildExpenseReply(expenseFile, catalog, edit)
  }
}
