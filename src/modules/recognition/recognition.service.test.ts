import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'

import { AiOperation, AiProvider, OCR_MODEL } from '@/commons/constants/ai.constant'
import { ExpenseDestination } from '@/commons/constants/expense.constant'
import { AiRequestLogDBRepository } from '@/db/models/ai-request-log/aiRequestLogDB.repository'
import { ExpenseDBRepository } from '@/db/models/expense/expenseDB.repository'
import { buildExtractionCatalog } from '@/modules/expense-extraction/expense-extraction.catalog'
import { mockCatalogSource } from '@/modules/expense-extraction/mocks/expense-extraction.mock'

import { OcrService } from './ocr.service'
import { RecognitionService } from './recognition.service'
import { RecognizedExpense, RecognizedScreen } from './recognition.templates'

const PLIN_TEXT = `Detalle de movimiento
s/-80.00
19 Set 2026 | 3:57 PM
Tipo de operación
Plin-Danery`

const catalog = buildExtractionCatalog({
  ...mockCatalogSource,
  paymentMethods: [
    ...mockCatalogSource.paymentMethods.map((method) =>
      method.id === 'method-ohpay' ? { ...method, isPrimary: true } : method,
    ),
    { ...mockCatalogSource.paymentMethods[2], id: 'method-plin', name: 'Plin', aliases: ['plin'] },
  ],
})

const recognized = (overrides: Partial<RecognizedExpense> = {}): RecognizedExpense => ({
  merchant: 'TIENDA ONLI',
  amount: 120,
  total: 1200,
  currency: 'PEN',
  spentAt: '2026-09-14',
  installments: 10,
  bankCategory: 'RESTAURANTES',
  pending: false,
  card: 'primary',
  transfer: null,
  counterpart: null,
  ...overrides,
})

describe('RecognitionService', () => {
  let service: RecognitionService
  const mockOcr = { enabled: true, read: vi.fn() }
  const mockAiRequestLog = { create: vi.fn(), countSince: vi.fn() }
  const mockExpenseDB = { sumCardExpensesProcessedBetween: vi.fn() }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecognitionService,
        { provide: OcrService, useValue: mockOcr },
        { provide: AiRequestLogDBRepository, useValue: mockAiRequestLog },
        { provide: ExpenseDBRepository, useValue: mockExpenseDB },
      ],
    }).compile()
    service = module.get(RecognitionService)
    mockOcr.enabled = true
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('recognize', () => {
    const image = { mimeType: 'image/jpeg', data: 'base64' }

    it('should read the screenshot with a template and log it as a local call', async () => {
      mockOcr.read.mockResolvedValue(PLIN_TEXT)

      const result = await service.recognize(image, 'draft-1')

      expect(result).toMatchObject({ screen: RecognizedScreen.BANK_MOVEMENT, expenses: [{ amount: 80 }] })
      expect(mockAiRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: AiProvider.LOCAL,
          model: OCR_MODEL,
          operation: AiOperation.RECOGNIZE,
          draftId: 'draft-1',
          success: true,
          errorCode: null,
        }),
      )
    })

    it('should give the screenshot to the AI when no template fits', async () => {
      mockOcr.read.mockResolvedValue('¡Yapeaste!\nS/ 25')

      expect(await service.recognize(image, 'draft-1')).toBeNull()
      expect(mockAiRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, errorCode: 'NO_TEMPLATE' }),
      )
    })

    it('should give the screenshot to the AI when the OCR fails', async () => {
      mockOcr.read.mockRejectedValue(new Error('worker crashed'))

      expect(await service.recognize(image, 'draft-1')).toBeNull()
      expect(mockAiRequestLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, errorCode: 'OCR_FAILED' }),
      )
    })

    it('should skip the OCR when it is turned off', async () => {
      mockOcr.enabled = false

      expect(await service.recognize(image, 'draft-1')).toBeNull()
      expect(mockOcr.read).not.toHaveBeenCalled()
      expect(mockAiRequestLog.create).not.toHaveBeenCalled()
    })
  })

  describe('toExpenses', () => {
    it('should put a purchase in cuotas on the primary card as its first installment (D45)', () => {
      const [expense] = service.toExpenses([recognized()], catalog)

      expect(expense).toMatchObject({
        destination: ExpenseDestination.CREDIT_CARD,
        description: 'TIENDA ONLI',
        amount: 120,
        installment: '1/10',
        paymentMethodId: 'method-ohpay',
        personId: 'person-brando',
        categoryId: 'category-food',
        notes: 'Total S/ 1200.00 en 10 cuotas',
      })
      expect(expense.confidence.amount).toBe(0.5)
    })

    it('should leave the destination of a Plin to a person to the user (D48)', () => {
      const [expense] = service.toExpenses(
        [
          recognized({
            merchant: 'Plin-Danery',
            amount: 80,
            total: 80,
            installments: null,
            bankCategory: null,
            card: null,
            transfer: 'Plin',
            counterpart: 'Danery',
          }),
        ],
        catalog,
      )

      expect(expense).toMatchObject({
        destination: null,
        description: 'Plin a Danery',
        paymentMethodId: 'method-plin',
        merchant: 'Danery',
        installment: null,
      })
      expect(expense.missingFields).toContain('destination')
    })
  })

  describe('reconcile', () => {
    it('should compare the month of the app with what Kogane registered on the primary card', async () => {
      vi.useFakeTimers({ now: new Date('2026-09-23T15:00:00Z'), toFake: ['Date'] })
      mockExpenseDB.sumCardExpensesProcessedBetween.mockResolvedValue(2800.5)
      const categories = [{ name: 'DELIVERY', amount: 300.25, count: 14 }]

      const result = await service.reconcile(
        { screen: RecognizedScreen.IO_CATEGORY_SUMMARY, month: 9, total: 3000.5, categories },
        catalog,
      )

      expect(result).toEqual({
        card: 'OhPay',
        month: 9,
        year: 2026,
        appTotal: 3000.5,
        registered: 2800.5,
        categories,
      })
      expect(mockExpenseDB.sumCardExpensesProcessedBetween).toHaveBeenCalledWith(
        'method-ohpay',
        new Date('2026-09-01T00:00:00Z'),
        new Date('2026-10-01T00:00:00Z'),
      )
    })

    it('should take a later month than today as the one of last year', async () => {
      vi.useFakeTimers({ now: new Date('2026-01-10T15:00:00Z'), toFake: ['Date'] })
      mockExpenseDB.sumCardExpensesProcessedBetween.mockResolvedValue(0)

      const result = await service.reconcile(
        { screen: RecognizedScreen.IO_CATEGORY_SUMMARY, month: 12, total: 10, categories: [] },
        catalog,
      )

      expect(result?.year).toBe(2025)
    })
  })

  it('should count today attempts and the ones solved without AI', async () => {
    mockAiRequestLog.countSince.mockResolvedValueOnce(5).mockResolvedValueOnce(3)

    expect(await service.todayStats()).toEqual({ attempts: 5, resolved: 3 })
  })
})
