import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import {
  BotAction,
  BotCommand,
  ChannelMessageType,
  FREE_CORRECTION_FIELD,
} from '@/commons/constants/conversation.constant'
import { DebtDirection, DebtTiming } from '@/commons/constants/debt.constant'
import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { ExpenseDraftChannel, ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { DuplicateExpenseDraftException } from '@/commons/exceptions/expense-draft/duplicate-expense-draft.exception'
import { StoredFileExpiredException } from '@/commons/exceptions/stored-file/stored-file-expired.exception'
import { ExpenseExtractionFailedException } from '@/commons/exceptions/expense-extraction/expense-extraction-failed.exception'
import { ExpenseDraftDBRepository } from '@/db/models/expense-draft/expenseDraftDB.repository'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'
import { DebtsService } from '@/modules/debts/debts.service'

import { ConversationService } from './conversation.service'
import { MediaDownloaderRegistry } from './media-downloader.registry'
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
  moveStaleOpenToReview: vi.fn(),
  failInterruptedUpdatedBefore: vi.fn(),
  discardOpenByChat: vi.fn(),
  findRecentSaved: vi.fn(),
  findByStatuses: vi.fn(),
  findByMediaUniqueId: vi.fn(),
  existsSavedWithOperationNumber: vi.fn(),
  parkMessage: vi.fn(),
}
const mockExpenseDB = { findMonthlyTotals: vi.fn() }
const mockMediaDownloader = { download: vi.fn() }
const mockStoredFiles = { download: vi.fn(), storeTemporary: vi.fn() }
const mockDebts = {
  proposePayment: vi.fn(),
  findProposal: vi.fn(),
  pickInstallment: vi.fn(),
  confirmPayment: vi.fn(),
  cancelPayment: vi.fn(),
  findOpen: vi.fn(),
  summary: vi.fn(),
}
const mockExtraction = {
  extract: vi.fn(),
  parseLocalCorrection: vi.fn(),
  loadCatalog: vi.fn(),
  getUsage: vi.fn(),
  transcribe: vi.fn(),
}
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
        { provide: MediaDownloaderRegistry, useValue: mockMediaDownloader },
        { provide: StoredFilesService, useValue: mockStoredFiles },
        { provide: DebtsService, useValue: mockDebts },
      ],
    }).compile()

    service = module.get<ConversationService>(ConversationService)

    mockExtraction.loadCatalog.mockResolvedValue(mockCatalog)
    mockExpenseDraftDB.findOpenByChat.mockResolvedValue(null)
    mockExpenseDraftDB.moveStaleOpenToReview.mockResolvedValue(0)
    mockExpenseDraftDB.failInterruptedUpdatedBefore.mockResolvedValue([])
    mockExpenseDraftDB.findByMediaUniqueId.mockResolvedValue(null)
    mockExpenseDraftDB.existsSavedWithOperationNumber.mockResolvedValue(false)
    mockExpenseDraftDB.create.mockImplementation(async (data) =>
      buildExpenseDraft({ ...data, id: `file-${data.itemIndex ?? 0}` }),
    )
    mockExpenseDraftDB.update.mockImplementation(async (id, data) => buildExpenseDraft({ id, ...data }))
    mockStoredFiles.storeTemporary.mockResolvedValue({ id: 'stored-1' })
    mockDebts.proposePayment.mockResolvedValue(null)
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
      expect(replies[0].text).toContain('borrador')
    })

    it('should discard messages without expenses', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [] })

      const { replies } = await service.handle(textMessage('hola'))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('file-0', { status: ExpenseDraftStatus.DISCARDED })
      expect(replies[0].text).toContain('No encontré un gasto')
    })
  })

  describe('images', () => {
    const imageMessage = (overrides: Partial<ChannelMessage> = {}): ChannelMessage => ({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId: CHAT_ID,
      messageId: '77',
      type: ChannelMessageType.IMAGE,
      media: { fileId: 'file-1', uniqueId: 'unique-1', sizeBytes: 150_000 },
      text: 'persona dany',
      ...overrides,
    })

    it('should download the image and send it to the AI with its caption', async () => {
      mockMediaDownloader.download.mockResolvedValue({ mimeType: 'image/jpeg', data: 'base64' })
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      const { replies } = await service.handle(imageMessage())

      expect(mockExpenseDraftDB.create).toHaveBeenCalledWith(
        expect.objectContaining({
          inputType: 'image',
          mediaFileId: 'file-1',
          mediaUniqueId: 'unique-1',
          rawText: 'persona dany',
        }),
      )
      expect(mockMediaDownloader.download).toHaveBeenCalledWith(ExpenseDraftChannel.TELEGRAM, 'file-1')
      expect(mockExtraction.extract).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'persona dany', images: [{ mimeType: 'image/jpeg', data: 'base64' }] }),
      )
      expect(replies).toHaveLength(1)
    })

    it('should not read the same image twice', async () => {
      mockExpenseDraftDB.findByMediaUniqueId.mockResolvedValue(buildExpenseDraft())

      const { replies } = await service.handle(imageMessage())

      expect(replies[0].text).toContain('Ya recibí esta imagen')
      expect(mockExpenseDraftDB.create).not.toHaveBeenCalled()
      expect(mockMediaDownloader.download).not.toHaveBeenCalled()
    })

    it('should reject an image file that is too large before downloading it', async () => {
      const { replies } = await service.handle(
        imageMessage({ media: { fileId: 'f', uniqueId: 'u', sizeBytes: 30_000_000 } }),
      )

      expect(replies[0].text).toContain('pesa demasiado')
      expect(mockMediaDownloader.download).not.toHaveBeenCalled()
    })

    it('should leave the image in /borrador as failed when it cannot be downloaded', async () => {
      mockMediaDownloader.download.mockRejectedValue(new Error('telegram down'))

      const { replies } = await service.handle(imageMessage())

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('file-0', { status: ExpenseDraftStatus.FAILED })
      expect(replies[0].text).toContain('/borrador')
      expect(mockExtraction.extract).not.toHaveBeenCalled()
    })

    it('should warn when a receipt with the same operation number was already saved', async () => {
      mockMediaDownloader.download.mockResolvedValue({ mimeType: 'image/jpeg', data: 'base64' })
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense({ operationNumber: '12345678' })] })
      mockExpenseDraftDB.existsSavedWithOperationNumber.mockResolvedValue(true)

      const { replies } = await service.handle(imageMessage())

      expect(mockExpenseDraftDB.existsSavedWithOperationNumber).toHaveBeenCalledWith('12345678', 'file-0')
      expect(replies[0].text).toContain('Parece que ya registraste este gasto')
    })
  })

  // D58: the bytes live in R2 (bot_files); the draft only keeps fileId
  describe('stored files', () => {
    const imageMessage = (overrides: Partial<ChannelMessage> = {}): ChannelMessage => ({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId: CHAT_ID,
      messageId: '77',
      type: ChannelMessageType.IMAGE,
      media: { fileId: 'file-1', uniqueId: 'unique-1', sizeBytes: 150_000 },
      ...overrides,
    })

    beforeEach(() => {
      mockMediaDownloader.download.mockResolvedValue({ mimeType: 'image/jpeg', data: 'aW1hZ2U=' })
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })
    })

    it('should keep a Telegram image as a temporary file the first time it is downloaded', async () => {
      await service.handle(imageMessage())

      expect(mockExpenseDraftDB.create).toHaveBeenCalledWith(expect.objectContaining({ fileId: null }))
      expect(mockStoredFiles.storeTemporary).toHaveBeenCalledWith(
        ExpenseDraftChannel.TELEGRAM,
        Buffer.from('aW1hZ2U=', 'base64'),
        'image/jpeg',
      )
      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('file-0', { fileId: 'stored-1' })
      expect(mockExtraction.extract).toHaveBeenCalledWith(
        expect.objectContaining({ images: [{ mimeType: 'image/jpeg', data: 'aW1hZ2U=' }] }),
      )
    })

    it('should read a web upload from storage instead of the channel', async () => {
      mockStoredFiles.download.mockResolvedValue({ mimeType: 'image/png', data: 'cG5n' })

      await service.handle(
        imageMessage({
          channel: ExpenseDraftChannel.WEB,
          media: { fileId: 'stored-9', uniqueId: 'sha-9', storedFileId: 'stored-9' },
        }),
      )

      expect(mockExpenseDraftDB.create).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'stored-9' }))
      expect(mockStoredFiles.download).toHaveBeenCalledWith('stored-9')
      expect(mockMediaDownloader.download).not.toHaveBeenCalled()
      expect(mockStoredFiles.storeTemporary).not.toHaveBeenCalled()
      expect(mockExtraction.extract).toHaveBeenCalledWith(
        expect.objectContaining({ images: [{ mimeType: 'image/png', data: 'cG5n' }] }),
      )
    })

    it('should go on with the extraction when the file cannot be stored', async () => {
      mockStoredFiles.storeTemporary.mockRejectedValue(new Error('R2 down'))

      const { replies } = await service.handle(imageMessage())

      expect(mockExpenseDraftDB.update).not.toHaveBeenCalledWith(
        'file-0',
        expect.objectContaining({ fileId: expect.anything() }),
      )
      expect(mockExtraction.extract).toHaveBeenCalled()
      expect(replies[0].buttons).toBeDefined()
    })

    it('should share the file with every expense read from the same screenshot', async () => {
      mockExtraction.extract.mockResolvedValue({
        expenses: [buildResolvedExpense(), buildResolvedExpense({ description: 'Pasaje', amount: 5 })],
      })

      const { replies } = await service.handle(imageMessage())

      expect(replies).toHaveLength(2)
      expect(mockExpenseDraftDB.create).toHaveBeenLastCalledWith(
        expect.objectContaining({ itemIndex: 1, mediaFileId: 'file-1', fileId: 'stored-1' }),
      )
    })

    it('should fail the draft and ask for the screenshot again when its file expired', async () => {
      mockStoredFiles.download.mockRejectedValue(new StoredFileExpiredException({ fileId: 'stored-old' }))

      const { replies } = await service.handle(
        imageMessage({ media: { fileId: 'stored-old', uniqueId: 'sha-old', storedFileId: 'stored-old' } }),
      )

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('file-0', { status: ExpenseDraftStatus.FAILED })
      expect(replies[0].text).toContain('La captura ya expiró')
      expect(mockExtraction.extract).not.toHaveBeenCalled()
    })

    it('should transcribe a voice note from its stored file on a retry', async () => {
      mockStoredFiles.download.mockResolvedValue({ mimeType: 'audio/ogg', data: 'b2dn' })
      mockExtraction.transcribe.mockResolvedValue('cafe 8 con plin')

      await service.retryExtraction(
        buildExpenseDraft({
          id: 'draft-voice',
          inputType: 'audio',
          rawText: null,
          mediaFileId: 'voice-1',
          fileId: 'stored-voice',
          status: ExpenseDraftStatus.FAILED,
        }),
      )

      expect(mockStoredFiles.download).toHaveBeenCalledWith('stored-voice')
      expect(mockMediaDownloader.download).not.toHaveBeenCalled()
      expect(mockExtraction.transcribe).toHaveBeenCalledWith({
        audio: { mimeType: 'audio/ogg', data: 'b2dn' },
        draftId: 'draft-voice',
      })
    })
  })

  describe('voice notes', () => {
    const voiceMessage = (durationSeconds = 6): ChannelMessage => ({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId: CHAT_ID,
      messageId: '88',
      type: ChannelMessageType.AUDIO,
      media: { fileId: 'voice-1', uniqueId: 'voice-unique-1', durationSeconds },
    })

    beforeEach(() => {
      mockMediaDownloader.download.mockResolvedValue({ mimeType: 'audio/ogg', data: 'ogg-b64' })
    })

    it('should transcribe the voice note, keep the text and read it like a typed message', async () => {
      mockExtraction.transcribe.mockResolvedValue('almuerzo 25 soles con yape')
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      const { replies } = await service.handle(voiceMessage())

      expect(mockExpenseDraftDB.create).toHaveBeenCalledWith(
        expect.objectContaining({ inputType: 'audio', rawText: null, mediaUniqueId: 'voice-unique-1' }),
      )
      expect(mockExtraction.transcribe).toHaveBeenCalledWith({
        audio: { mimeType: 'audio/ogg', data: 'ogg-b64' },
        draftId: 'file-0',
      })
      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('file-0', { rawText: 'almuerzo 25 soles con yape' })
      expect(mockExtraction.extract).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'almuerzo 25 soles con yape', images: undefined }),
      )
      expect(replies[0].text).toContain('Entendí: <i>«almuerzo 25 soles con yape»</i>')
    })

    it('should reject a voice note longer than a minute before downloading it', async () => {
      const { replies } = await service.handle(voiceMessage(95))

      expect(replies[0].text).toContain('hasta 60 segundos')
      expect(mockMediaDownloader.download).not.toHaveBeenCalled()
    })

    it('should discard a voice note without words', async () => {
      mockExtraction.transcribe.mockResolvedValue('')

      const { replies } = await service.handle(voiceMessage())

      expect(replies[0].text).toContain('No entendí el audio')
      expect(mockExtraction.extract).not.toHaveBeenCalled()
    })

    it('should leave it in /borrador as failed when Whisper fails', async () => {
      mockExtraction.transcribe.mockRejectedValue(new Error('429'))

      const { replies } = await service.handle(voiceMessage())

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('file-0', { status: ExpenseDraftStatus.FAILED })
      expect(replies[0].text).toContain('/borrador')
    })

    it('should not transcribe again when a failed voice note already has its text', async () => {
      const failed = buildExpenseDraft({
        status: ExpenseDraftStatus.FAILED,
        inputType: 'audio',
        mediaFileId: 'voice-1',
        rawText: 'cafe 8 con plin',
      })
      mockExpenseDraftDB.findById.mockResolvedValue(failed)
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      await service.handle(action(BotAction.RESUME))

      expect(mockExtraction.transcribe).not.toHaveBeenCalled()
      expect(mockExtraction.extract).toHaveBeenCalledWith(expect.objectContaining({ text: 'cafe 8 con plin' }))
    })
  })

  describe('open draft', () => {
    it('should move stale drafts to Borrador before looking for the active one', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      await service.handle(textMessage('almuerzo 25'))

      const cutoff = mockExpenseDraftDB.moveStaleOpenToReview.mock.calls[0][2] as Date
      expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(30 * 60_000 - 1000)
      expect(mockExpenseDraftDB.findOpenByChat).toHaveBeenCalledWith(ExpenseDraftChannel.TELEGRAM, CHAT_ID, cutoff)
    })

    it('should send stale drafts the AI never finished to /borrador as failed before moving the rest to Borrador', async () => {
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      await service.handle(textMessage('almuerzo 25'))

      const cutoff = mockExpenseDraftDB.moveStaleOpenToReview.mock.calls[0][2] as Date
      expect(mockExpenseDraftDB.failInterruptedUpdatedBefore).toHaveBeenCalledWith(
        ExpenseDraftChannel.TELEGRAM,
        cutoff,
        CHAT_ID,
      )
      expect(mockExpenseDraftDB.failInterruptedUpdatedBefore.mock.invocationCallOrder[0]).toBeLessThan(
        mockExpenseDraftDB.moveStaleOpenToReview.mock.invocationCallOrder[0],
      )
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
      // and a new message at the end of the chat, which does notify
      expect(result.replies[1]).toEqual({
        text: '✅ Guardado: Almuerzo S/ 25.00 en Costo fijo.\nVer: /ultimos · /resumen',
      })
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
      [BotAction.LATER, ExpenseDraftStatus.PENDING_REVIEW, 'En borrador', 2],
      [BotAction.DISCARD, ExpenseDraftStatus.DISCARDED, 'Descartado', 1],
    ])('%s should close the expense as %s', async (name, status, text, replies) => {
      const result = await service.handle(action(name))

      expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(FILE_ID, { status, pendingField: null })
      expect(result.replies[0]).toMatchObject({ edit: true, text: expect.stringContaining(text) })
      expect(result.replies).toHaveLength(replies)
    })

    it('should send a new message when an expense goes to Borrador', async () => {
      const { replies } = await service.handle(action(BotAction.LATER))

      expect(replies[1]).toEqual({
        text: '📝 Quedó en /borrador: Almuerzo S/ 25.00. Retómalo cuando quieras.',
      })
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

  describe('AI usage (/uso)', () => {
    it('should show each model against its usable limit', async () => {
      mockExtraction.getUsage.mockResolvedValue([
        { provider: 'gemini', model: 'gemini-lite', used: 12, dailyLimit: 500, usableLimit: 450 },
        { provider: 'groq', model: 'qwen', used: 900, dailyLimit: 1000, usableLimit: 900 },
      ])

      const { replies } = await service.handle(command(BotCommand.USAGE))

      expect(replies[0].text).toContain('🟢 <b>gemini</b> gemini-lite: 12 de 450')
      expect(replies[0].text).toContain('🔴 <b>groq</b> qwen: 900 de 900')
    })
  })

  describe('Borrador (/borrador)', () => {
    it('should list every expense pending review', async () => {
      mockExpenseDraftDB.findByStatuses.mockResolvedValue({
        items: [buildExpenseDraft({ status: ExpenseDraftStatus.PENDING_REVIEW })],
        total: 1,
      })

      const { replies } = await service.handle(command(BotCommand.DRAFTS))

      expect(mockExpenseDraftDB.findByStatuses).toHaveBeenCalledWith(
        ExpenseDraftChannel.TELEGRAM,
        CHAT_ID,
        [
          ExpenseDraftStatus.DRAFT,
          ExpenseDraftStatus.AWAITING_CONFIRMATION,
          ExpenseDraftStatus.PENDING_REVIEW,
          ExpenseDraftStatus.FAILED,
        ],
        5,
      )
      expect(replies[0].text).toContain('Borrador')
      expect(replies[1].buttons?.[0][0].label).toBe('↩️ Retomar')
    })

    it('should reopen a pending expense with its confirmation buttons', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(buildExpenseDraft({ status: ExpenseDraftStatus.PENDING_REVIEW }))

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

    it('should only accept Retomar and Descartar on pending expenses', async () => {
      mockExpenseDraftDB.findById.mockResolvedValue(buildExpenseDraft({ status: ExpenseDraftStatus.PENDING_REVIEW }))

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
  // P17: loans and debts in the chat
  describe('debts', () => {
    const danery = { id: 'person-danery', name: 'Danery' }
    const debtView = (overrides = {}) => ({
      id: 'debt-aug',
      direction: DebtDirection.OWED_TO_ME,
      description: 'Iphone 16',
      amount: 400,
      currency: 'PEN',
      installment: '2/3',
      paymentMonth: 8,
      paymentYear: 2026,
      paidAmount: 0,
      balance: 400,
      timing: DebtTiming.LATE,
      personId: danery.id,
      person: danery,
      ...overrides,
    })
    const proposal = (overrides = {}) => ({
      batchId: 'batch1',
      personId: danery.id,
      direction: DebtDirection.OWED_TO_ME,
      items: [{ debt: debtView(), amount: 150 }],
      excess: 0,
      ...overrides,
    })
    const payAction = (name: BotAction, value?: string): ChannelMessage => ({
      channel: ExpenseDraftChannel.TELEGRAM,
      chatId: CHAT_ID,
      messageId: 'callback:9',
      type: ChannelMessageType.ACTION,
      action: { name, draftId: 'batch1', value },
    })
    const commandWith = (name: BotCommand, text: string): ChannelMessage => ({ ...command(name), text })

    it('should propose a payment for "dany me pagó 150" without calling the AI', async () => {
      mockDebts.proposePayment.mockResolvedValue(proposal())

      const { replies } = await service.handle(textMessage('dany me pagó 150'))

      expect(mockDebts.proposePayment).toHaveBeenCalledWith(danery.id, DebtDirection.OWED_TO_ME, 150)
      expect(replies[0].text).toContain('Abono de Danery')
      expect(replies[0].text).toContain('Iphone 16 2/3 (ago 2026): S/ 150.00 → saldo S/ 250.00')
      expect(replies[0].buttons?.flat().map((button) => button.data)).toEqual([
        'pay:batch1',
        'payl:batch1',
        'payx:batch1',
      ])
      expect(mockExtraction.extract).not.toHaveBeenCalled()
      expect(mockExpenseDraftDB.create).not.toHaveBeenCalled()
    })

    it('should warn about what exceeds every installment', async () => {
      mockDebts.proposePayment.mockResolvedValue(proposal({ items: [{ debt: debtView(), amount: 400 }], excess: 50 }))

      const { replies } = await service.handle(textMessage('dany me pagó 450'))

      expect(replies[0].text).toContain('pagada ✅')
      expect(replies[0].text).toContain('Sobran S/ 50.00')
    })

    it('should read the text as a new expense when the person owes nothing', async () => {
      mockDebts.proposePayment.mockResolvedValue(null)
      mockExtraction.extract.mockResolvedValue({ expenses: [buildResolvedExpense()] })

      await service.handle(textMessage('le pagué 50 a dany'))

      expect(mockDebts.proposePayment).toHaveBeenCalledWith(danery.id, DebtDirection.I_OWE, 50)
      expect(mockExtraction.extract).toHaveBeenCalled()
    })

    it('should save the payment with ✅ Confirmar and show the new balance', async () => {
      mockDebts.confirmPayment.mockResolvedValue([debtView({ paidAmount: 150, balance: 250 })])

      const result = await service.handle(payAction(BotAction.PAY_CONFIRM))

      expect(mockDebts.confirmPayment).toHaveBeenCalledWith('batch1')
      expect(result.notice).toBe('Guardado')
      expect(result.replies[0]).toMatchObject({ edit: true })
      expect(result.replies[0].text).toContain('Abono guardado')
      expect(result.replies[0].text).toContain('saldo S/ 250.00')
    })

    it('should list the open installments with ✏️ Elegir cuota and move the payment to the one picked', async () => {
      mockDebts.findProposal.mockResolvedValue(proposal())
      mockDebts.findOpen.mockResolvedValue([
        debtView(),
        debtView({ id: 'debt-sep', installment: '3/3', paymentMonth: 9 }),
      ])

      const list = await service.handle(payAction(BotAction.PAY_LIST))

      expect(mockDebts.findOpen).toHaveBeenCalledWith(danery.id, DebtDirection.OWED_TO_ME)
      expect(list.replies[0].buttons?.flat().map((button) => button.data)).toEqual([
        'payp:batch1:debt-aug',
        'payp:batch1:debt-sep',
        'payx:batch1',
      ])

      mockDebts.pickInstallment.mockResolvedValue(
        proposal({ items: [{ debt: debtView({ id: 'debt-sep', installment: '3/3', paymentMonth: 9 }), amount: 150 }] }),
      )
      const picked = await service.handle(payAction(BotAction.PAY_PICK, 'debt-sep'))

      expect(mockDebts.pickInstallment).toHaveBeenCalledWith('batch1', 'debt-sep')
      expect(picked.replies[0].text).toContain('Iphone 16 3/3 (set 2026)')
    })

    it('should cancel a payment and ignore an expired one', async () => {
      const cancelled = await service.handle(payAction(BotAction.PAY_CANCEL))
      expect(mockDebts.cancelPayment).toHaveBeenCalledWith('batch1')
      expect(cancelled.replies[0].text).toContain('Abono cancelado')

      mockDebts.confirmPayment.mockResolvedValue(null)
      const expired = await service.handle(payAction(BotAction.PAY_CONFIRM))
      expect(expired).toEqual({ replies: [], notice: 'Este abono ya no está pendiente. Escríbelo de nuevo.' })
      expect(mockExpenseDraftDB.findById).not.toHaveBeenCalled()
    })

    it('should total everyone with /deudas', async () => {
      mockDebts.summary.mockResolvedValue([
        { personId: danery.id, name: 'Danery', owedToMe: 800, iOwe: 50, net: 750, late: 400, dueThisMonth: 0 },
      ])

      const { replies } = await service.handle(command(BotCommand.DEBTS))

      expect(replies[0].text).toContain('• Danery: te debe S/ 800.00 · le debes S/ 50.00 · ⚠️ S/ 400.00 vencido')
      expect(replies[0].text).toContain('neto S/ 750.00')
    })

    it('should detail one person with /deudas dany', async () => {
      mockDebts.findOpen.mockResolvedValue([debtView({ paidAmount: 100, balance: 300 })])

      const { replies } = await service.handle(commandWith(BotCommand.DEBTS, '/deudas dany'))

      expect(mockDebts.findOpen).toHaveBeenCalledWith(danery.id)
      expect(replies[0].text).toContain('<b>Danery</b>')
      expect(replies[0].text).toContain('• Iphone 16 2/3 · ago 2026 · S/ 300.00 (abonado S/ 100.00) ⚠️ vencida')
    })

    it('should write a message to forward with /cobrar dany', async () => {
      mockDebts.findOpen.mockResolvedValue([
        debtView(),
        debtView({ id: 'debt-sep', installment: '3/3', paymentMonth: 9 }),
      ])

      const { replies } = await service.handle(commandWith(BotCommand.COLLECT, '/cobrar dany'))

      expect(mockDebts.findOpen).toHaveBeenCalledWith(danery.id, DebtDirection.OWED_TO_ME)
      expect(replies[0].text).toContain('Hola Danery 👋')
      expect(replies[0].text).toContain('• Iphone 16 (cuota 3/3), set 2026: S/ 400.00')
      expect(replies[0].text).toContain('<b>Total: S/ 800.00</b>')
      expect(replies[0].buttons).toBeUndefined()
    })

    it('should ask who with /cobrar and say when the person is unknown', async () => {
      expect((await service.handle(command(BotCommand.COLLECT))).replies[0].text).toContain('/cobrar dany')
      expect((await service.handle(commandWith(BotCommand.DEBTS, '/deudas pedro'))).replies[0].text).toContain(
        'No encontré a <b>pedro</b>',
      )
      expect(mockDebts.findOpen).not.toHaveBeenCalled()
    })
  })
})
