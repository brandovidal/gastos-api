import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import {
  BotAction,
  BotCommand,
  ChannelMessageType,
  FREE_CORRECTION_FIELD,
} from '@/commons/constants/conversation.constant'
import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { ExpenseDraftChannel, ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { DuplicateExpenseDraftException } from '@/commons/exceptions/expense-draft/duplicate-expense-draft.exception'
import { ExpenseExtractionFailedException } from '@/commons/exceptions/expense-extraction/expense-extraction-failed.exception'
import { ExpenseDraftDBRepository } from '@/db/models/expense-draft/expenseDraftDB.repository'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'

import { ConversationService } from './conversation.service'
import { ExpenseSaverService } from './expense-saver.service'
import { ChannelMessage } from './dto/conversation.types'
import {
  buildExpenseDraft,
  buildResolvedExpense,
  CHAT_ID,
  FILE_ID,
  mockCatalog,
  textMessage,
} from './mocks/conversation.mock'

const mockExpenseDraftDB = {
  create: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  findOpenByChat: vi.fn(),
  discardOpenUpdatedBefore: vi.fn(),
  discardOpenByChat: vi.fn(),
  findRecentSaved: vi.fn(),
  findByStatuses: vi.fn(),
}
const mockExpenseDB = { findMonthlyTotals: vi.fn() }
const mockExtraction = { extract: vi.fn(), parseLocalCorrection: vi.fn(), loadCatalog: vi.fn() }
const mockSaver = { save: vi.fn() }
const mockPaymentMethodDB = { create: vi.fn(), updateBillingDays: vi.fn() }

const action = (name: BotAction, field?: string, value?: string): ChannelMessage => ({
  channel: ExpenseDraftChannel.TELEGRAM,
  chatId: CHAT_ID,
  messageId: 'callback:1',
  type: ChannelMessageType.ACTION,
  action: { name, draftId: FILE_ID, field, value },
})

const command = (name: BotCommand): ChannelMessage => ({
  channel: ExpenseDraftChannel.TELEGRAM,
  chatId: CHAT_ID,
  messageId: '12',
  type: ChannelMessageType.COMMAND,
  command: name,
})

describe('ConversationService', () => {
  let service: ConversationService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: ExpenseDraftDBRepository, useValue: mockExpenseDraftDB },
        { provide: ExpenseDBRepository, useValue: mockExpenseDB },
        { provide: PaymentMethodDBRepository, useValue: mockPaymentMethodDB },
        { provide: ExpenseExtractionService, useValue: mockExtraction },
        { provide: ExpenseSaverService, useValue: mockSaver },
      ],
    }).compile()

    service = module.get<ConversationService>(ConversationService)

    mockExtraction.loadCatalog.mockResolvedValue(mockCatalog)
    mockExpenseDraftDB.findOpenByChat.mockResolvedValue(null)
    mockExpenseDraftDB.discardOpenUpdatedBefore.mockResolvedValue(0)
    mockExpenseDraftDB.create.mockImplementation(async (data) =>
      buildExpenseDraft({ ...data, id: `file-${data.itemIndex ?? 0}` }),
    )
    mockExpenseDraftDB.update.mockImplementation(async (id, data) => buildExpenseDraft({ id, ...data }))
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('new expenses', () => {
    it('should extract the message and show the summary with the confirmation buttons', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      const { replies } = await service.handle(textMessage('almuerzo 25 soles con yape'))

      expect(mockExpenseDraftDB.create).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: CHAT_ID, messageId: '11', rawText: 'almuerzo 25 soles con yape' }),
      )
      expect(mockExtraction.extract).toHaveBeenCalledWith({
        text: 'almuerzo 25 soles con yape',
        draftId: 'file-0',
      })
      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
        'file-0',
        expect.objectContaining({ status: ExpenseDraftStatus.AWAITING_CONFIRMATION, pendingField: null }),
      )
      expect(replies).toHaveLength(1)
      expect(replies[0].text).toContain('Almuerzo')
      expect(replies[0].buttons?.[0][0].label).toBe('✅ Guardar')
    })

    it('should create one expense draft per expense in the message', async () => {
      mockExtraction.extract.mockResolvedValue({
        expenses: [buildResolvedExpense(), buildResolvedExpense({ description: 'Taxi', amount: 12 })],
      })

      const { replies } = await service.handle(textMessage('almuerzo 25 y taxi 12'))

      expect(mockExpenseDraftDB.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ itemIndex: 1 }))
      expect(replies).toHaveLength(2)
      expect(replies[1].text).toContain('Taxi')
    })

    it('should ask the first missing field', async () => {
      mockExtraction.extract.mockResolvedValue({
        expenses: [buildResolvedExpense({ categoryId: null, missingFields: [ExpenseField.CATEGORY] })],
      })

      const { replies } = await service.handle(textMessage('almuerzo 25'))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
        'file-0',
        expect.objectContaining({ status: ExpenseDraftStatus.DRAFT, pendingField: ExpenseField.CATEGORY }),
      )
      expect(replies[0].text).toContain('¿Qué categoría?')
    })

    it('should ignore a webhook retry of a message already received', async () => {
      mockExpenseDraftDB.create.mockRejectedValue(new DuplicateExpenseDraftException())

      const { replies } = await service.handle(textMessage('almuerzo 25'))

      expect(replies).toEqual([])
      expect(mockExtraction.extract).not.toHaveBeenCalled()
    })

    it('should leave the expense draft as failed when no AI can extract it', async () => {
      mockExtraction.extract.mockRejectedValue(new ExpenseExtractionFailedException())

      const { replies } = await service.handle(textMessage('almuerzo 25'))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('file-0', { status: ExpenseDraftStatus.FAILED })
      expect(replies[0].text).toContain('bandeja')
    })

    it('should discard messages without expenses', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [] })

      const { replies } = await service.handle(textMessage('hola'))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('file-0', { status: ExpenseDraftStatus.DISCARDED })
      expect(replies[0].text).toContain('No encontré un gasto')
    })
  })

  describe('open draft', () => {
    it('should discard stale drafts before looking for the active one', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      await service.handle(textMessage('almuerzo 25'))

      const cutoff = mockExpenseDraftDB.discardOpenUpdatedBefore.mock.calls[0][2] as Date
      expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(30 * 60_000 - 1000)
      expect(mockExpenseDraftDB.findOpenByChat).toHaveBeenCalledWith(ExpenseDraftChannel.TELEGRAM, CHAT_ID, cutoff)
    })

    it('should apply a local correction without calling the AI and trust the corrected field', async () => {
      mockExpenseDraftDB.findOpenByChat.mockResolvedValue(buildExpenseDraft({ confidence: { amount: 0.3 } }))
      mockExtraction.parseLocalCorrection.mockResolvedValue({ amount: 30 })

      const { replies } = await service.handle(textMessage('monto 30'))

      expect(mockExtraction.parseLocalCorrection).toHaveBeenCalledWith('monto 30', null)
      expect(mockExtraction.extract).not.toHaveBeenCalled()
      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({ amount: 30, confidence: { amount: 1 } }),
      )
      expect(replies[0].text).toContain('S/ 30.00')
    })

    it('should answer the pending question and move to the next missing field', async () => {
      mockExpenseDraftDB.findOpenByChat.mockResolvedValue(
        buildExpenseDraft({
          status: ExpenseDraftStatus.DRAFT,
          categoryId: null,
          paymentMethodId: null,
          pendingField: ExpenseField.CATEGORY,
          missingFields: [ExpenseField.CATEGORY, ExpenseField.PAYMENT_METHOD],
        }),
      )
      mockExtraction.parseLocalCorrection.mockResolvedValue({ categoryId: 'category-food' })

      await service.handle(textMessage('comida'))

      expect(mockExtraction.parseLocalCorrection).toHaveBeenCalledWith('comida', ExpenseField.CATEGORY)
      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({
          categoryId: 'category-food',
          status: ExpenseDraftStatus.DRAFT,
          pendingField: ExpenseField.PAYMENT_METHOD,
        }),
      )
    })

    it('should treat a message that is not a correction as a new expense', async () => {
      mockExpenseDraftDB.findOpenByChat.mockResolvedValue(buildExpenseDraft())
      mockExtraction.parseLocalCorrection.mockResolvedValue(null)
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense({ description: 'Taxi' })] })

      const { replies } = await service.handle(textMessage('taxi 15 soles'))

      expect(mockExpenseDraftDB.create).toHaveBeenCalled()
      expect(replies[0].text).toContain('Taxi')
    })

    it('should send the message to the AI with the draft after ✏️ Corregir', async () => {
      const draft = buildExpenseDraft({ pendingField: FREE_CORRECTION_FIELD })
      mockExpenseDraftDB.findOpenByChat.mockResolvedValue(draft)
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense({ amount: 30 })] })

      await service.handle(textMessage('eran 30 y fue con la oh'))

      expect(mockExtraction.parseLocalCorrection).not.toHaveBeenCalled()
      expect(mockExtraction.extract).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'eran 30 y fue con la oh',
          draftId: FILE_ID,
          draft: expect.any(Object),
        }),
      )
      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({ amount: 30, pendingField: null }),
      )
    })

    it('should leave correction mode when the AI correction fails', async () => {
      mockExpenseDraftDB.findOpenByChat.mockResolvedValue(buildExpenseDraft({ pendingField: FREE_CORRECTION_FIELD }))
      mockExtraction.extract.mockRejectedValue(new ExpenseExtractionFailedException())

      const { replies } = await service.handle(textMessage('cambia todo'))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(FILE_ID, { pendingField: null })
      expect(replies[0].text).toContain('No pude aplicar la corrección')
    })
  })

  describe('buttons', () => {
    beforeEach(() => {
      mockExpenseDraftDB.findById.mockResolvedValue(buildExpenseDraft())
    })

    it('should save the expense and close the summary', async () => {
      const result = await service.handle(action(BotAction.SAVE))

      expect(mockSaver.save).toHaveBeenCalledWith(expect.objectContaining({ id: FILE_ID }))
      expect(result.notice).toBe('Guardado')
      expect(result.replies[0]).toMatchObject({ edit: true, text: expect.stringContaining('Guardado en Costo fijo') })
      expect(result.replies[0].buttons).toBeUndefined()
    })

    it('should ask the missing field instead of saving an incomplete expense', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(
        buildExpenseDraft({
          status: ExpenseDraftStatus.DRAFT,
          pendingField: ExpenseField.CATEGORY,
          missingFields: [ExpenseField.CATEGORY],
        }),
      )

      const result = await service.handle(action(BotAction.SAVE))

      expect(mockSaver.save).not.toHaveBeenCalled()
      expect(result.replies[0].text).toContain('¿Qué categoría?')
    })

    it('should enter correction mode with ✏️', async () => {
      const result = await service.handle(action(BotAction.EDIT))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(FILE_ID, { pendingField: FREE_CORRECTION_FIELD })
      expect(result.replies[0].text).toContain('Escribe la corrección')
    })

    it.each([
      [BotAction.INBOX, ExpenseDraftStatus.INBOX, 'En la bandeja'],
      [BotAction.DISCARD, ExpenseDraftStatus.DISCARDED, 'Descartado'],
    ])('%s should close the expense as %s', async (name, status, text) => {
      const result = await service.handle(action(name))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(FILE_ID, { status, pendingField: null })
      expect(result.replies[0]).toMatchObject({ edit: true, text: expect.stringContaining(text) })
    })

    it('should set a field from a quick reply and edit the same message', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(
        buildExpenseDraft({
          status: ExpenseDraftStatus.DRAFT,
          paymentMethodId: null,
          destination: null,
          pendingField: ExpenseField.PAYMENT_METHOD,
          missingFields: [ExpenseField.DESTINATION, ExpenseField.PAYMENT_METHOD],
        }),
      )

      const result = await service.handle(action(BotAction.SET_FIELD, ExpenseField.PAYMENT_METHOD, 'method-ohpay'))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({
          paymentMethodId: 'method-ohpay',
          destination: ExpenseDestination.CREDIT_CARD,
          status: ExpenseDraftStatus.AWAITING_CONFIRMATION,
        }),
      )
      expect(result.replies[0].edit).toBe(true)
    })

    it('should reject quick replies with values that no longer exist', async () => {
      const result = await service.handle(action(BotAction.SET_FIELD, ExpenseField.CATEGORY, 'category-gone'))

      expect(mockExpenseDraftDB.update).not.toHaveBeenCalled()
      expect(result.notice).toBe('Este gasto ya fue procesado')
    })

    it.each([
      ['already saved', buildExpenseDraft({ status: ExpenseDraftStatus.SAVED })],
      ['from another chat', buildExpenseDraft({ chatId: '999' })],
      ['missing', null],
    ])('should ignore buttons of an expense %s', async (_case, expenseDraft) => {
      mockExpenseDraftDB.findById.mockResolvedValue(expenseDraft)

      const result = await service.handle(action(BotAction.SAVE))

      expect(mockSaver.save).not.toHaveBeenCalled()
      expect(result).toEqual({ replies: [], notice: 'Este gasto ya fue procesado' })
    })
  })

  describe('commands', () => {
    it('should show the help for /start and unknown commands', async () => {
      const [start] = (await service.handle(command(BotCommand.START))).replies
      const [unknown] = (await service.handle({ ...command(BotCommand.START), command: 'foo' })).replies

      expect(start.text).toContain('Escríbeme tus gastos')
      expect(unknown.text).toBe(start.text)
    })

    it('should discard the open draft with /cancelar', async () => {
      mockExpenseDraftDB.discardOpenByChat.mockResolvedValue(1)

      const { replies } = await service.handle(command(BotCommand.CANCEL))

      expect(mockExpenseDraftDB.discardOpenByChat).toHaveBeenCalledWith(ExpenseDraftChannel.TELEGRAM, CHAT_ID)
      expect(replies[0].text).toContain('Descarté el borrador')
    })

    it('should list the last saved expenses with /ultimos', async () => {
      mockExpenseDraftDB.findRecentSaved.mockResolvedValue([buildExpenseDraft()])

      const { replies } = await service.handle(command(BotCommand.RECENT))

      expect(mockExpenseDraftDB.findRecentSaved).toHaveBeenCalledWith(ExpenseDraftChannel.TELEGRAM, CHAT_ID, 5)
      expect(replies[0].text).toContain('Almuerzo')
    })

    it('should total the current month with /resumen', async () => {
      mockExpenseDB.findMonthlyTotals.mockResolvedValue([])

      const { replies } = await service.handle(command(BotCommand.SUMMARY))

      expect(mockExpenseDB.findMonthlyTotals).toHaveBeenCalledWith(expect.any(Number), expect.any(Number))
      expect(replies[0].text).toBe('No hay gastos registrados este mes.')
    })
  })

  describe('inbox (/bandeja)', () => {
    it('should list inbox and failed expenses', async () => {
      mockExpenseDraftDB.findByStatuses.mockResolvedValue({
        items: [buildExpenseDraft({ status: ExpenseDraftStatus.INBOX })],
        total: 1,
      })

      const { replies } = await service.handle(command(BotCommand.INBOX))

      expect(mockExpenseDraftDB.findByStatuses).toHaveBeenCalledWith(
        ExpenseDraftChannel.TELEGRAM,
        CHAT_ID,
        [ExpenseDraftStatus.INBOX, ExpenseDraftStatus.FAILED],
        5,
      )
      expect(replies[0].text).toContain('Bandeja')
      expect(replies[1].buttons?.[0][0].label).toBe('↩️ Retomar')
    })

    it('should reopen an inbox expense with its confirmation buttons', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(buildExpenseDraft({ status: ExpenseDraftStatus.INBOX }))

      const result = await service.handle(action(BotAction.RESUME))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({ status: ExpenseDraftStatus.AWAITING_CONFIRMATION }),
      )
      expect(result.notice).toBe('Retomado')
      expect(result.replies[0]).toMatchObject({ edit: true })
      expect(result.replies[0].buttons?.[0][0].label).toBe('✅ Guardar')
    })

    it('should retry the AI on a failed expense', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(
        buildExpenseDraft({ status: ExpenseDraftStatus.FAILED, rawText: 'almuerzo 25 con yape' }),
      )
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      const result = await service.handle(action(BotAction.RESUME))

      expect(mockExtraction.extract).toHaveBeenCalledWith({ text: 'almuerzo 25 con yape', draftId: FILE_ID })
      expect(result.replies[0].text).toContain('Almuerzo')
    })

    it('should only accept Retomar and Descartar on inbox expenses', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(buildExpenseDraft({ status: ExpenseDraftStatus.INBOX }))

      const saved = await service.handle(action(BotAction.SAVE))
      const discarded = await service.handle(action(BotAction.DISCARD))

      expect(saved).toEqual({ replies: [], notice: 'Este gasto ya fue procesado' })
      expect(mockSaver.save).not.toHaveBeenCalled()
      expect(discarded.replies[0].text).toContain('Descartado')
    })
  })

  describe('payment methods typed in the chat', () => {
    const askingPayment = () =>
      buildExpenseDraft({
        status: ExpenseDraftStatus.DRAFT,
        destination: ExpenseDestination.DAILY,
        paymentMethodId: null,
        pendingField: ExpenseField.PAYMENT_METHOD,
        missingFields: [ExpenseField.PAYMENT_METHOD],
      })

    it('should offer to add a payment method it does not know', async () => {
      mockExpenseDraftDB.findOpenByChat.mockResolvedValue(askingPayment())
      mockExtraction.parseLocalCorrection.mockResolvedValue(null)

      const { replies } = await service.handle(textMessage('bbva'))

      expect(replies[0].text).toContain('No conozco <b>bbva</b>')
      expect(mockExpenseDraftDB.create).not.toHaveBeenCalled()
    })

    it('should treat an answer with an amount as a new expense', async () => {
      mockExpenseDraftDB.findOpenByChat.mockResolvedValue(askingPayment())
      mockExtraction.parseLocalCorrection.mockResolvedValue(null)
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense({ description: 'Taxi' })] })

      await service.handle(textMessage('taxi 15'))

      expect(mockExpenseDraftDB.create).toHaveBeenCalled()
    })

    it('should create a wallet and use it for the expense', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(askingPayment())
      mockPaymentMethodDB.create.mockResolvedValue({ id: 'method-yape', name: 'bbva' })

      const result = await service.handle(action(BotAction.NEW_PAYMENT_METHOD, 'wallet', 'bbva'))

      expect(mockPaymentMethodDB.create).toHaveBeenCalledWith('bbva', PaymentMethodType.WALLET)
      expect(result.replies[0]).toMatchObject({ edit: true, text: expect.stringContaining('Agregué <b>bbva</b>') })
      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({ paymentMethodId: 'method-yape' }),
      )
    })

    it('should ask the billing days of a new credit card and save them', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(askingPayment())
      mockPaymentMethodDB.create.mockResolvedValue({ id: 'method-ohpay', name: 'Ripley' })

      const created = await service.handle(action(BotAction.NEW_PAYMENT_METHOD, 'credit_card', 'Ripley'))

      expect(mockExpenseDraftDB.update).toHaveBeenLastCalledWith(FILE_ID, { pendingField: 'card_days:method-ohpay' })
      expect(created.replies[1].text).toContain('cierra la facturación')

      mockExpenseDraftDB.findOpenByChat.mockResolvedValue(buildExpenseDraft({ pendingField: 'card_days:method-ohpay' }))
      mockPaymentMethodDB.updateBillingDays.mockResolvedValue({ id: 'method-ohpay', name: 'Ripley' })

      const invalid = await service.handle(textMessage('no sé'))
      expect(invalid.replies[0].text).toContain('No entendí los días')

      const { replies } = await service.handle(textMessage('cierre 15, pago 5'))
      expect(mockPaymentMethodDB.updateBillingDays).toHaveBeenCalledWith('method-ohpay', 15, 5)
      expect(replies[0].text).toContain('Guardé los días de <b>Ripley</b>')
    })

    it('should not create anything when the user answers "No"', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(askingPayment())

      const result = await service.handle(action(BotAction.NEW_PAYMENT_METHOD))

      expect(mockPaymentMethodDB.create).not.toHaveBeenCalled()
      expect(result.replies[0].text).toContain('no lo agregué')
    })
  })
})
