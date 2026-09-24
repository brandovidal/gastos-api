import { Test } from '@nestjs/testing'
import { vi } from 'vitest'

import { AiOperation } from '@/commons/constants/ai.constant'
import { NotificationKind } from '@/commons/constants/notification.constant'
import { StatementRowResult, StatementSource, StatementStatus } from '@/commons/constants/statement.constant'
import { StatementUnreadableException } from '@/commons/exceptions/statement/statement-unreadable.exception'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'
import { StatementDBRepository } from '@/db/models/statement/statementDB.repository'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { NotificationsService } from '@/modules/notifications/notifications.service'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { readPdfLines } from './statement-pdf.reader'
import { StatementsService } from './statements.service'

vi.mock('./statement-pdf.reader', () => ({ readPdfLines: vi.fn() }))

const SIP_LINES = [
  'ESTADO DE CUENTA - TARJETA SIP',
  'Fecha de cierre 10/09/2026',
  'Ultimo dia de pago 05/10/2026',
  'Total a pagar S/ 200.40',
  '15/08 16/08 MP*MERCADOLI 1/3 164.90',
  '20/08 20/08 TAMBO VIRREY 35.50',
]

const OH = { id: 'oh', name: 'Sip', type: 'credit_card', code: 'OH', billingCloseDay: 10, paymentDueDay: 5 }

const mockStatementDB = {
  create: vi.fn(),
  findById: vi.fn(),
  findMany: vi.fn(),
  findCardExpenses: vi.fn(),
  createExpenses: vi.fn(),
  setRowResult: vi.fn(),
  delete: vi.fn(),
}
const mockPaymentMethods = { findAll: vi.fn(), findById: vi.fn() }
const mockPeople = { findDefault: vi.fn() }
const mockExtraction = { generateStructured: vi.fn() }
const mockFiles = { storeTemporary: vi.fn(), keep: vi.fn() }
const mockNotifications = { notify: vi.fn() }

const saved = (rows: Record<string, unknown>[]) => ({
  id: 's1',
  paymentMethodId: 'oh',
  paymentMonth: 9,
  paymentYear: 2026,
  totalDue: 200.4,
  dueDate: new Date('2026-10-05T00:00:00Z'),
  rows,
})

describe('StatementsService', () => {
  let service: StatementsService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StatementsService,
        { provide: StatementDBRepository, useValue: mockStatementDB },
        { provide: PaymentMethodDBRepository, useValue: mockPaymentMethods },
        { provide: PersonDBRepository, useValue: mockPeople },
        { provide: ExpenseExtractionService, useValue: mockExtraction },
        { provide: StoredFilesService, useValue: mockFiles },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile()
    service = module.get(StatementsService)

    mockPeople.findDefault.mockResolvedValue({ id: 'me', documentNumber: '44556677' })
    mockPaymentMethods.findAll.mockResolvedValue([OH, { id: 'yape', type: 'wallet', code: null }])
    mockPaymentMethods.findById.mockResolvedValue(OH)
    mockStatementDB.findCardExpenses.mockResolvedValue([
      {
        id: 'e1',
        description: 'Mercado Libre',
        amount: 164.9,
        processDate: new Date('2026-08-15T00:00:00Z'),
        installment: '1/3',
      },
      { id: 'e2', description: 'Uber', amount: 20, processDate: new Date('2026-08-21T00:00:00Z'), installment: null },
    ])
    mockStatementDB.create.mockImplementation(async (data) => ({ id: 's1', ...data }))
    mockFiles.storeTemporary.mockResolvedValue({ id: 'file-1' })
    mockNotifications.notify.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should open the PDF with the document number, read it without AI and reconcile it with the card month', async () => {
    vi.mocked(readPdfLines).mockResolvedValue(SIP_LINES)
    mockStatementDB.findById.mockImplementation(async () => ({
      ...saved([
        { result: StatementRowResult.MATCHED, expenseId: 'e1' },
        { result: StatementRowResult.NEW, expenseId: null },
      ]),
    }))

    const view = await service.upload({ data: Buffer.from('pdf') })

    expect(readPdfLines).toHaveBeenCalledWith(Buffer.from('pdf'), '44556677')
    expect(mockExtraction.generateStructured).not.toHaveBeenCalled()
    expect(mockStatementDB.findCardExpenses).toHaveBeenCalledWith('oh', { paymentMonth: 9, paymentYear: 2026 })
    expect(mockStatementDB.create).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodId: 'oh',
        paymentMonth: 9,
        paymentYear: 2026,
        totalDue: 200.4,
        dueDate: new Date('2026-10-05T00:00:00.000Z'),
        source: StatementSource.TEMPLATE,
        fileId: 'file-1',
        status: StatementStatus.REVIEW,
        rows: [
          expect.objectContaining({ description: 'MP*MERCADOLI', result: StatementRowResult.MATCHED, expenseId: 'e1' }),
          expect.objectContaining({ description: 'TAMBO VIRREY', result: StatementRowResult.NEW, expenseId: null }),
        ],
      }),
    )
    expect(mockFiles.keep).toHaveBeenCalledWith('file-1')
    expect(view).toMatchObject({ cardName: 'Sip', koganeTotal: 184.9, difference: 15.5 })
    expect(view.missing.map((expense) => expense.id)).toEqual(['e2'])
    expect(mockNotifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({ kind: NotificationKind.STATEMENT, dedupeKey: 'statement:s1' }),
    )
  })

  it('should send only the masked text to the AI when the template does not add up', async () => {
    vi.mocked(readPdfLines).mockResolvedValue(['Tarjeta SIP', 'Titular 44556677', 'Total a pagar 999.00'])
    mockExtraction.generateStructured.mockResolvedValue({
      cardName: 'Sip',
      periodEnd: '2026-09-10',
      dueDate: '2026-10-05',
      totalDue: 999,
      minimumDue: null,
      currency: 'PEN',
      movements: [{ date: '2026-08-20', description: 'CINE', amount: 999, currency: 'PEN', installment: null }],
    })
    mockStatementDB.findById.mockResolvedValue(saved([]))

    await service.upload({ data: Buffer.from('pdf') })

    const request = mockExtraction.generateStructured.mock.calls[0][0]
    expect(request.operation).toBe(AiOperation.STATEMENT)
    expect(request.text).not.toContain('44556677')
    expect(mockStatementDB.create).toHaveBeenCalledWith(
      expect.objectContaining({ source: StatementSource.AI, rows: [expect.objectContaining({ description: 'CINE' })] }),
    )
  })

  it('should ask for the card when the statement does not say which one', async () => {
    vi.mocked(readPdfLines).mockResolvedValue(['Fecha de cierre 10/09/2026', 'Total a pagar 20.00', '01/09 CINE 20.00'])

    await expect(service.upload({ data: Buffer.from('pdf') })).rejects.toBeInstanceOf(StatementUnreadableException)
    mockStatementDB.findById.mockResolvedValue(saved([]))
    await service.upload({ data: Buffer.from('pdf'), paymentMethodId: 'oh' })
    expect(mockStatementDB.create).toHaveBeenCalledWith(expect.objectContaining({ paymentMethodId: 'oh' }))
  })

  it('should create the new rows as pending card expenses of the statement month', async () => {
    mockStatementDB.findById.mockResolvedValue(
      saved([
        {
          id: 'r1',
          result: StatementRowResult.NEW,
          description: 'TAMBO',
          amount: 35.5,
          currency: 'PEN',
          installment: null,
          date: new Date('2026-08-20T00:00:00Z'),
          expenseId: null,
        },
        {
          id: 'r2',
          result: StatementRowResult.MATCHED,
          description: 'X',
          amount: 1,
          currency: 'PEN',
          installment: null,
          date: null,
          expenseId: 'e1',
        },
      ]),
    )

    await service.createNew('s1')

    expect(mockStatementDB.createExpenses).toHaveBeenCalledWith('s1', [
      {
        id: 'r1',
        data: expect.objectContaining({
          description: 'TAMBO',
          amount: 35.5,
          amountInPen: 35.5,
          paymentStatus: 'pending',
          personId: 'me',
          paymentMethodId: 'oh',
          paymentMonth: 9,
          paymentYear: 2026,
        }),
      },
    ])
  })
})
