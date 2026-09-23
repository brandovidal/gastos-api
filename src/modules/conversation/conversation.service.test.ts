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
import { ExpenseFileChannel, ExpenseFileStatus } from '@/commons/constants/expense-file.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { DuplicateExpenseFileException } from '@/commons/exceptions/expense-file/duplicate-expense-file.exception'
import { ExpenseExtractionFailedException } from '@/commons/exceptions/expense-extraction/expense-extraction-failed.exception'
import { ExpenseFileDBRepository } from '@/db/models/expense-file/expenseFileDB.repository'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'

import { ConversationService } from './conversation.service'
import { ExpenseSaverService } from './expense-saver.service'
import { ChannelMessage } from './dto/conversation.types'
import {
  buildExpenseFile,
  buildResolvedExpense,
  CHAT_ID,
  FILE_ID,
  mockCatalog,
  textMessage,
} from './mocks/conversation.mock'

const mockExpenseFileDB = {
  create: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  findOpenByChat: vi.fn(),
  discardOpenUpdatedBefore: vi.fn(),
  discardOpenByChat: vi.fn(),
  findRecentSaved: vi.fn(),
}
const mockExpenseDB = { findMonthlyTotals: vi.fn() }
const mockExtraction = { extract: vi.fn(), parseLocalCorrection: vi.fn(), loadCatalog: vi.fn() }
const mockSaver = { save: vi.fn() }

const action = (name: BotAction, field?: string, value?: string): ChannelMessage => ({
  channel: ExpenseFileChannel.TELEGRAM,
  chatId: CHAT_ID,
  messageId: 'callback:1',
  type: ChannelMessageType.ACTION,
  action: { name, expenseFileId: FILE_ID, field, value },
})

const command = (name: BotCommand): ChannelMessage => ({
  channel: ExpenseFileChannel.TELEGRAM,
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
        { provide: ExpenseFileDBRepository, useValue: mockExpenseFileDB },
        { provide: ExpenseDBRepository, useValue: mockExpenseDB },
        { provide: ExpenseExtractionService, useValue: mockExtraction },
        { provide: ExpenseSaverService, useValue: mockSaver },
      ],
    }).compile()

    service = module.get<ConversationService>(ConversationService)

    mockExtraction.loadCatalog.mockResolvedValue(mockCatalog)
    mockExpenseFileDB.findOpenByChat.mockResolvedValue(null)
    mockExpenseFileDB.discardOpenUpdatedBefore.mockResolvedValue(0)
    mockExpenseFileDB.create.mockImplementation(async (data) =>
      buildExpenseFile({ ...data, id: `file-${data.itemIndex ?? 0}` }),
    )
    mockExpenseFileDB.update.mockImplementation(async (id, data) => buildExpenseFile({ id, ...data }))
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('new expenses', () => {
    it('should extract the message and show the summary with the confirmation buttons', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      const { replies } = await service.handle(textMessage('almuerzo 25 soles con yape'))

      expect(mockExpenseFileDB.create).toHaveBeenCalledWith(
        expect.objectContaining({ chatId: CHAT_ID, messageId: '11', rawText: 'almuerzo 25 soles con yape' }),
      )
      expect(mockExtraction.extract).toHaveBeenCalledWith({
        text: 'almuerzo 25 soles con yape',
        expenseFileId: 'file-0',
      })
      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(
        'file-0',
        expect.objectContaining({ status: ExpenseFileStatus.AWAITING_CONFIRMATION, pendingField: null }),
      )
      expect(replies).toHaveLength(1)
      expect(replies[0].text).toContain('Almuerzo')
      expect(replies[0].buttons?.[0][0].label).toBe('✅ Guardar')
    })

    it('should create one expense file per expense in the message', async () => {
      mockExtraction.extract.mockResolvedValue({
        expenses: [buildResolvedExpense(), buildResolvedExpense({ description: 'Taxi', amount: 12 })],
      })

      const { replies } = await service.handle(textMessage('almuerzo 25 y taxi 12'))

      expect(mockExpenseFileDB.create).toHaveBeenNthCalledWith(2, expect.objectContaining({ itemIndex: 1 }))
      expect(replies).toHaveLength(2)
      expect(replies[1].text).toContain('Taxi')
    })

    it('should ask the first missing field', async () => {
      mockExtraction.extract.mockResolvedValue({
        expenses: [buildResolvedExpense({ categoryId: null, missingFields: [ExpenseField.CATEGORY] })],
      })

      const { replies } = await service.handle(textMessage('almuerzo 25'))

      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(
        'file-0',
        expect.objectContaining({ status: ExpenseFileStatus.DRAFT, pendingField: ExpenseField.CATEGORY }),
      )
      expect(replies[0].text).toContain('¿Qué categoría?')
    })

    it('should ignore a webhook retry of a message already received', async () => {
      mockExpenseFileDB.create.mockRejectedValue(new DuplicateExpenseFileException())

      const { replies } = await service.handle(textMessage('almuerzo 25'))

      expect(replies).toEqual([])
      expect(mockExtraction.extract).not.toHaveBeenCalled()
    })

    it('should leave the expense file as failed when no AI can extract it', async () => {
      mockExtraction.extract.mockRejectedValue(new ExpenseExtractionFailedException())

      const { replies } = await service.handle(textMessage('almuerzo 25'))

      expect(mockExpenseFileDB.update).toHaveBeenCalledWith('file-0', { status: ExpenseFileStatus.FAILED })
      expect(replies[0].text).toContain('bandeja')
    })

    it('should discard messages without expenses', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [] })

      const { replies } = await service.handle(textMessage('hola'))

      expect(mockExpenseFileDB.update).toHaveBeenCalledWith('file-0', { status: ExpenseFileStatus.DISCARDED })
      expect(replies[0].text).toContain('No encontré un gasto')
    })
  })

  describe('open draft', () => {
    it('should discard stale drafts before looking for the active one', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      await service.handle(textMessage('almuerzo 25'))

      const cutoff = mockExpenseFileDB.discardOpenUpdatedBefore.mock.calls[0][2] as Date
      expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(30 * 60_000 - 1000)
      expect(mockExpenseFileDB.findOpenByChat).toHaveBeenCalledWith(ExpenseFileChannel.TELEGRAM, CHAT_ID, cutoff)
    })

    it('should apply a local correction without calling the AI and trust the corrected field', async () => {
      mockExpenseFileDB.findOpenByChat.mockResolvedValue(buildExpenseFile({ confidence: { amount: 0.3 } }))
      mockExtraction.parseLocalCorrection.mockResolvedValue({ amount: 30 })

      const { replies } = await service.handle(textMessage('monto 30'))

      expect(mockExtraction.parseLocalCorrection).toHaveBeenCalledWith('monto 30', null)
      expect(mockExtraction.extract).not.toHaveBeenCalled()
      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({ amount: 30, confidence: { amount: 1 } }),
      )
      expect(replies[0].text).toContain('S/ 30.00')
    })

    it('should answer the pending question and move to the next missing field', async () => {
      mockExpenseFileDB.findOpenByChat.mockResolvedValue(
        buildExpenseFile({
          status: ExpenseFileStatus.DRAFT,
          categoryId: null,
          paymentMethodId: null,
          pendingField: ExpenseField.CATEGORY,
          missingFields: [ExpenseField.CATEGORY, ExpenseField.PAYMENT_METHOD],
        }),
      )
      mockExtraction.parseLocalCorrection.mockResolvedValue({ categoryId: 'category-food' })

      await service.handle(textMessage('comida'))

      expect(mockExtraction.parseLocalCorrection).toHaveBeenCalledWith('comida', ExpenseField.CATEGORY)
      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({
          categoryId: 'category-food',
          status: ExpenseFileStatus.DRAFT,
          pendingField: ExpenseField.PAYMENT_METHOD,
        }),
      )
    })

    it('should treat a message that is not a correction as a new expense', async () => {
      mockExpenseFileDB.findOpenByChat.mockResolvedValue(buildExpenseFile())
      mockExtraction.parseLocalCorrection.mockResolvedValue(null)
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense({ description: 'Taxi' })] })

      const { replies } = await service.handle(textMessage('taxi 15 soles'))

      expect(mockExpenseFileDB.create).toHaveBeenCalled()
      expect(replies[0].text).toContain('Taxi')
    })

    it('should send the message to the AI with the draft after ✏️ Corregir', async () => {
      const draft = buildExpenseFile({ pendingField: FREE_CORRECTION_FIELD })
      mockExpenseFileDB.findOpenByChat.mockResolvedValue(draft)
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense({ amount: 30 })] })

      await service.handle(textMessage('eran 30 y fue con la oh'))

      expect(mockExtraction.parseLocalCorrection).not.toHaveBeenCalled()
      expect(mockExtraction.extract).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'eran 30 y fue con la oh', expenseFileId: FILE_ID, draft: expect.any(Object) }),
      )
      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({ amount: 30, pendingField: null }),
      )
    })

    it('should leave correction mode when the AI correction fails', async () => {
      mockExpenseFileDB.findOpenByChat.mockResolvedValue(buildExpenseFile({ pendingField: FREE_CORRECTION_FIELD }))
      mockExtraction.extract.mockRejectedValue(new ExpenseExtractionFailedException())

      const { replies } = await service.handle(textMessage('cambia todo'))

      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(FILE_ID, { pendingField: null })
      expect(replies[0].text).toContain('No pude aplicar la corrección')
    })
  })

  describe('buttons', () => {
    beforeEach(() => {
      mockExpenseFileDB.findById.mockResolvedValue(buildExpenseFile())
    })

    it('should save the expense and close the summary', async () => {
      const result = await service.handle(action(BotAction.SAVE))

      expect(mockSaver.save).toHaveBeenCalledWith(expect.objectContaining({ id: FILE_ID }))
      expect(result.notice).toBe('Guardado')
      expect(result.replies[0]).toMatchObject({ edit: true, text: expect.stringContaining('Guardado en Costo fijo') })
      expect(result.replies[0].buttons).toBeUndefined()
    })

    it('should ask the missing field instead of saving an incomplete expense', async () => {
      mockExpenseFileDB.findById.mockResolvedValue(
        buildExpenseFile({
          status: ExpenseFileStatus.DRAFT,
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

      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(FILE_ID, { pendingField: FREE_CORRECTION_FIELD })
      expect(result.replies[0].text).toContain('Escribe la corrección')
    })

    it.each([
      [BotAction.INBOX, ExpenseFileStatus.INBOX, 'En la bandeja'],
      [BotAction.DISCARD, ExpenseFileStatus.DISCARDED, 'Descartado'],
    ])('%s should close the expense as %s', async (name, status, text) => {
      const result = await service.handle(action(name))

      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(FILE_ID, { status, pendingField: null })
      expect(result.replies[0]).toMatchObject({ edit: true, text: expect.stringContaining(text) })
    })

    it('should set a field from a quick reply and edit the same message', async () => {
      mockExpenseFileDB.findById.mockResolvedValue(
        buildExpenseFile({
          status: ExpenseFileStatus.DRAFT,
          paymentMethodId: null,
          destination: null,
          pendingField: ExpenseField.PAYMENT_METHOD,
          missingFields: [ExpenseField.DESTINATION, ExpenseField.PAYMENT_METHOD],
        }),
      )

      const result = await service.handle(action(BotAction.SET_FIELD, ExpenseField.PAYMENT_METHOD, 'method-ohpay'))

      expect(mockExpenseFileDB.update).toHaveBeenCalledWith(
        FILE_ID,
        expect.objectContaining({
          paymentMethodId: 'method-ohpay',
          creditCardId: 'card-oh',
          destination: ExpenseDestination.CREDIT_CARD,
          status: ExpenseFileStatus.AWAITING_CONFIRMATION,
        }),
      )
      expect(result.replies[0].edit).toBe(true)
    })

    it('should reject quick replies with values that no longer exist', async () => {
      const result = await service.handle(action(BotAction.SET_FIELD, ExpenseField.CATEGORY, 'category-gone'))

      expect(mockExpenseFileDB.update).not.toHaveBeenCalled()
      expect(result.notice).toBe('Este gasto ya fue procesado')
    })

    it.each([
      ['already saved', buildExpenseFile({ status: ExpenseFileStatus.SAVED })],
      ['from another chat', buildExpenseFile({ chatId: '999' })],
      ['missing', null],
    ])('should ignore buttons of an expense %s', async (_case, expenseFile) => {
      mockExpenseFileDB.findById.mockResolvedValue(expenseFile)

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
      mockExpenseFileDB.discardOpenByChat.mockResolvedValue(1)

      const { replies } = await service.handle(command(BotCommand.CANCEL))

      expect(mockExpenseFileDB.discardOpenByChat).toHaveBeenCalledWith(ExpenseFileChannel.TELEGRAM, CHAT_ID)
      expect(replies[0].text).toContain('Descarté el borrador')
    })

    it('should list the last saved expenses with /ultimos', async () => {
      mockExpenseFileDB.findRecentSaved.mockResolvedValue([buildExpenseFile()])

      const { replies } = await service.handle(command(BotCommand.RECENT))

      expect(mockExpenseFileDB.findRecentSaved).toHaveBeenCalledWith(ExpenseFileChannel.TELEGRAM, CHAT_ID, 5)
      expect(replies[0].text).toContain('Almuerzo')
    })

    it('should total the current month with /resumen', async () => {
      mockExpenseDB.findMonthlyTotals.mockResolvedValue([])

      const { replies } = await service.handle(command(BotCommand.SUMMARY))

      expect(mockExpenseDB.findMonthlyTotals).toHaveBeenCalledWith(expect.any(Number), expect.any(Number))
      expect(replies[0].text).toBe('No hay gastos registrados este mes.')
    })
  })
})
