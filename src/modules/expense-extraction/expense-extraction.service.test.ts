import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { AiErrorCode, AiInputPartType, AiOperation, AiProvider } from '@/commons/constants/ai.constant'
import { ExpenseField } from '@/commons/constants/expense-extraction.constant'
import { ExpenseExtractionFailedException } from '@/commons/exceptions/expense-extraction/expense-extraction-failed.exception'
import { AiExtractorProviderStrategy } from '@/providers/ai/ai-extractor-provider.strategy'
import { AiRequestLogDBRepository } from '@/db/models/ai-request-log/aiRequestLogDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { CategoryDBRepository } from '@/db/models/category/categoryDB.repository'

import { GroqTranscriberService } from '@/providers/ai/groq/groq-transcriber.service'
import { TranscriptionFailedException } from '@/commons/exceptions/expense-extraction/transcription-failed.exception'

import { ExpenseExtractionService } from './expense-extraction.service'
import { mockCategories, mockExtractedExpense, mockPaymentMethods, mockPeople } from './mocks/expense-extraction.mock'

const config = {
  ai: { timeoutMs: 1000 },
  gemini: { modelLite: 'gemini-lite', model: 'gemini-flash', dailyLimitLite: 500, dailyLimit: 20 },
  groq: { model: 'qwen', dailyLimit: 1000, transcribeModel: 'whisper', transcribeDailyLimit: 2000 },
}

const validOutput = JSON.stringify({ expenses: [mockExtractedExpense] })

const mockGemini = { provider: AiProvider.GEMINI, supportsImages: true, generateJson: vi.fn() }
const mockGroq = { provider: AiProvider.GROQ, supportsImages: false, generateJson: vi.fn() }

const mockStrategy = {
  getProvider: vi.fn((type: AiProvider) => (type === AiProvider.GEMINI ? mockGemini : mockGroq)),
}
const mockAiRequestLog = { create: vi.fn(), countSince: vi.fn() }
const mockTranscriber = { transcribe: vi.fn() }

describe('ExpenseExtractionService', () => {
  let service: ExpenseExtractionService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseExtractionService,
        { provide: ConfigService, useValue: { getOrThrow: (key: string) => config[key] } },
        { provide: AiExtractorProviderStrategy, useValue: mockStrategy },
        { provide: AiRequestLogDBRepository, useValue: mockAiRequestLog },
        { provide: PersonDBRepository, useValue: { findActive: vi.fn().mockResolvedValue(mockPeople) } },
        { provide: PaymentMethodDBRepository, useValue: { findActive: vi.fn().mockResolvedValue(mockPaymentMethods) } },
        { provide: CategoryDBRepository, useValue: { findAll: vi.fn().mockResolvedValue(mockCategories) } },
        { provide: GroqTranscriberService, useValue: mockTranscriber },
      ],
    }).compile()

    service = module.get<ExpenseExtractionService>(ExpenseExtractionService)

    mockAiRequestLog.countSince.mockResolvedValue(0)
    mockAiRequestLog.create.mockResolvedValue({})
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should extract text with Gemini Flash-Lite and resolve catalog refs', async () => {
    mockGemini.generateJson.mockResolvedValue({ text: validOutput, inputTokens: 900, outputTokens: 120 })

    const result = await service.extract({ text: 'almuerzo 25 soles yape para dany', draftId: 'file-1' })

    expect(result.provider).toBe(AiProvider.GEMINI)
    expect(result.model).toBe('gemini-lite')
    expect(result.expenses[0].personId).toBe('person-danery')
    expect(result.expenses[0].missingFields).toEqual([ExpenseField.DESTINATION])
    expect(mockGemini.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-lite',
        parts: [{ type: AiInputPartType.TEXT, text: 'almuerzo 25 soles yape para dany' }],
        timeoutMs: 1000,
      }),
    )
    expect(mockAiRequestLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: AiProvider.GEMINI,
        success: true,
        draftId: 'file-1',
        inputTokens: 900,
      }),
    )
  })

  it('should retry once with the validation error when the output does not match the schema', async () => {
    mockGemini.generateJson
      .mockResolvedValueOnce({ text: '{"expenses":[{"amount":-1}]}' })
      .mockResolvedValueOnce({ text: validOutput })

    const result = await service.extract({ text: 'almuerzo 25' })

    expect(result.provider).toBe(AiProvider.GEMINI)
    const retryParts = mockGemini.generateJson.mock.calls[1][0].parts
    expect(retryParts[retryParts.length - 1].text).toContain('did not match the schema')
    expect(mockAiRequestLog.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ success: false, errorCode: AiErrorCode.INVALID_OUTPUT }),
    )
  })

  it('should fall back to Groq for text when Gemini fails', async () => {
    mockGemini.generateJson.mockRejectedValue(new Error('503'))
    mockGroq.generateJson.mockResolvedValue({ text: validOutput })

    const result = await service.extract({ text: 'almuerzo 25' })

    expect(result.provider).toBe(AiProvider.GROQ)
    expect(mockAiRequestLog.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ provider: AiProvider.GEMINI, errorCode: AiErrorCode.PROVIDER_ERROR }),
    )
  })

  it('should try Qwen first when AI_TEXT_PRIMARY is groq, and keep Gemini for images', async () => {
    config.ai = { timeoutMs: 1000, textPrimary: AiProvider.GROQ } as typeof config.ai
    mockGroq.generateJson.mockResolvedValue({ text: validOutput })

    try {
      await expect(service.extract({ text: 'almuerzo 25' })).resolves.toMatchObject({ provider: AiProvider.GROQ })
      expect(mockGemini.generateJson).not.toHaveBeenCalled()

      mockGemini.generateJson.mockResolvedValue({ text: validOutput })
      await expect(service.extract({ images: [{ mimeType: 'image/jpeg', data: 'b64' }] })).resolves.toMatchObject({
        provider: AiProvider.GEMINI,
      })
    } finally {
      config.ai = { timeoutMs: 1000 }
    }
  })

  it('should skip a model whose daily quota is almost spent', async () => {
    mockAiRequestLog.countSince.mockImplementation((provider: AiProvider) => (provider === AiProvider.GEMINI ? 450 : 0))
    mockGroq.generateJson.mockResolvedValue({ text: validOutput })

    const result = await service.extract({ text: 'almuerzo 25' })

    expect(result.provider).toBe(AiProvider.GROQ)
    expect(mockGemini.generateJson).not.toHaveBeenCalled()
  })

  it('should report today usage of each model once, against 90 % of its quota', async () => {
    mockAiRequestLog.countSince.mockImplementation((_provider: AiProvider, model: string) =>
      model === 'gemini-lite' ? 120 : 3,
    )

    const usage = await service.getUsage()

    expect(usage).toEqual([
      { provider: AiProvider.GEMINI, model: 'gemini-lite', used: 120, dailyLimit: 500, usableLimit: 450 },
      { provider: AiProvider.GROQ, model: 'qwen', used: 3, dailyLimit: 1000, usableLimit: 900 },
      { provider: AiProvider.GEMINI, model: 'gemini-flash', used: 3, dailyLimit: 20, usableLimit: 18 },
      { provider: AiProvider.GROQ, model: 'whisper', used: 3, dailyLimit: 2000, usableLimit: 1800 },
    ])
  })

  it('should use Gemini Flash, not Groq, as the image fallback', async () => {
    mockGemini.generateJson.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ text: validOutput })

    const result = await service.extract({ images: [{ mimeType: 'image/jpeg', data: 'base64' }] })

    expect(result.model).toBe('gemini-flash')
    expect(mockGroq.generateJson).not.toHaveBeenCalled()
    expect(mockGemini.generateJson.mock.calls[0][0].parts).toEqual([
      { type: AiInputPartType.IMAGE, mimeType: 'image/jpeg', data: 'base64' },
      { type: AiInputPartType.TEXT, text: 'Extract the expenses from the image(s).' },
    ])
  })

  it('should throw ExpenseExtractionFailedException when every model fails', async () => {
    mockGemini.generateJson.mockRejectedValue(new Error('503'))
    mockGroq.generateJson.mockResolvedValue({ text: 'not json' })

    await expect(service.extract({ text: 'almuerzo 25' })).rejects.toThrow(ExpenseExtractionFailedException)
    expect(mockGroq.generateJson).toHaveBeenCalledTimes(2)
  })

  it('should not lose the extraction when the usage log cannot be saved', async () => {
    mockAiRequestLog.create.mockRejectedValue(new Error('db down'))
    mockGemini.generateJson.mockResolvedValue({ text: validOutput })

    await expect(service.extract({ text: 'almuerzo 25' })).resolves.toBeDefined()
  })

  it('should parse local corrections with the current catalog', async () => {
    await expect(service.parseLocalCorrection('dany', ExpenseField.PERSON)).resolves.toEqual({
      personId: 'person-danery',
    })
  })

  describe('transcribe', () => {
    const audio = { mimeType: 'audio/ogg', data: 'b64' }

    it('should transcribe with Whisper on Groq and log it as a transcription', async () => {
      mockTranscriber.transcribe.mockResolvedValue('almuerzo 25 soles con yape')

      await expect(service.transcribe({ audio, draftId: 'draft-1' })).resolves.toBe('almuerzo 25 soles con yape')

      expect(mockTranscriber.transcribe).toHaveBeenCalledWith({
        model: 'whisper',
        mimeType: 'audio/ogg',
        data: 'b64',
        timeoutMs: 1000,
      })
      expect(mockAiRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: AiProvider.GROQ,
          model: 'whisper',
          operation: 'transcribe',
          success: true,
        }),
      )
    })

    it('should fail and log the error when Whisper fails', async () => {
      mockTranscriber.transcribe.mockRejectedValue(new Error('429'))

      await expect(service.transcribe({ audio })).rejects.toThrow(TranscriptionFailedException)
      expect(mockAiRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ operation: 'transcribe', success: false, errorCode: 'PROVIDER_ERROR' }),
      )
    })

    it('should not call Whisper when its daily quota is almost spent', async () => {
      mockAiRequestLog.countSince.mockResolvedValue(1800)

      await expect(service.transcribe({ audio })).rejects.toThrow(TranscriptionFailedException)
      expect(mockTranscriber.transcribe).not.toHaveBeenCalled()
    })
  })

  describe('generateStructured (P14 statements)', () => {
    const parse = (json: unknown) =>
      typeof json === 'object' && json && 'total' in json
        ? { success: true as const, data: json as { total: number } }
        : { success: false as const, error: 'no total' }
    const request = { instructions: 'read', text: 'Total 20', jsonSchema: {}, parse, operation: AiOperation.STATEMENT }

    it('should follow the text route and log the call as a statement reading', async () => {
      mockGemini.generateJson.mockResolvedValue({ text: '{"total": 20}' })

      expect(await service.generateStructured(request)).toEqual({ total: 20 })
      expect(mockGroq.generateJson).not.toHaveBeenCalled()
      expect(mockAiRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AiOperation.STATEMENT, success: true }),
      )
    })

    it('should try the next model when one fails or answers something else, and return null when none can', async () => {
      mockGroq.generateJson.mockResolvedValue({ text: '{"otro": 1}' })
      mockGemini.generateJson.mockRejectedValue(new Error('503'))

      expect(await service.generateStructured(request)).toBeNull()
      expect(mockGroq.generateJson).toHaveBeenCalled()
      expect(mockGemini.generateJson).toHaveBeenCalled()
    })
  })
})
