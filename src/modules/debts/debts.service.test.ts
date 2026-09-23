import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { DebtDirection, DebtStatus, DebtTiming } from '@/commons/constants/debt.constant'
import { DebtPaymentExceedsBalanceException } from '@/commons/exceptions/debt/debt-payment-exceeds-balance.exception'
import { DebtDBRepository } from '@/db/models/debt/debtDB.repository'
import { DebtWithPersonDbDto } from '@/db/models/debt/debtDB.dto'

import { DebtsService } from './debts.service'

const danery = { id: 'person-danery', name: 'Danery' }
const bruce = { id: 'person-bruce', name: 'Bruce' }

const buildDebt = (overrides: Partial<DebtWithPersonDbDto> = {}): DebtWithPersonDbDto => ({
  id: 'debt-1',
  direction: DebtDirection.OWED_TO_ME,
  description: 'Iphone 16',
  amount: 400,
  currency: 'PEN',
  exchangeRate: null,
  amountInPen: 400,
  installment: '1/3',
  paymentMonth: 9,
  paymentYear: 2026,
  dueDate: null,
  status: DebtStatus.PENDING,
  paidAmount: 0,
  paidDate: null,
  personId: danery.id,
  person: danery,
  notes: null,
  draftId: null,
  createdAt: new Date('2026-09-01T12:00:00Z'),
  updatedAt: new Date('2026-09-01T12:00:00Z'),
  ...overrides,
})

const mockRepository = {
  findMany: vi.fn(),
  findOpen: vi.fn(),
  findById: vi.fn(),
  createMany: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  addPayment: vi.fn(),
  deletePayment: vi.fn(),
  replaceProposal: vi.fn(),
  findProposal: vi.fn(),
  confirmProposal: vi.fn(),
  discardProposal: vi.fn(),
}

describe('DebtsService', () => {
  let service: DebtsService

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-23T17:00:00Z'))

    const module: TestingModule = await Test.createTestingModule({
      providers: [DebtsService, { provide: DebtDBRepository, useValue: mockRepository }],
    }).compile()
    service = module.get(DebtsService)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetAllMocks()
  })

  it('should add the balance and the timing to every installment', async () => {
    mockRepository.findMany.mockResolvedValue([
      buildDebt({ paymentMonth: 8, paidAmount: 150, status: DebtStatus.PARTIAL }),
      buildDebt({ id: 'debt-2', paymentMonth: 10 }),
    ])

    const [late, upcoming] = await service.list({ status: DebtStatus.PARTIAL })

    expect(mockRepository.findMany).toHaveBeenCalledWith({ statuses: [DebtStatus.PARTIAL] })
    expect(late).toMatchObject({ balance: 250, timing: DebtTiming.LATE })
    expect(upcoming).toMatchObject({ balance: 400, timing: DebtTiming.UPCOMING })
  })

  it('should total per person: owed to me, I owe, net, late and due this month (soles only)', async () => {
    mockRepository.findOpen.mockResolvedValue([
      buildDebt({ paymentMonth: 8 }),
      buildDebt({ id: 'd2', paymentMonth: 9, paidAmount: 100 }),
      buildDebt({ id: 'd3', direction: DebtDirection.I_OWE, amount: 50 }),
      buildDebt({ id: 'd4', personId: bruce.id, person: bruce, amount: 1000, paymentMonth: 12 }),
      buildDebt({ id: 'd5', currency: 'USD', amount: 30 }),
    ])

    await expect(service.summary()).resolves.toEqual([
      { personId: bruce.id, name: 'Bruce', owedToMe: 1000, iOwe: 0, net: 1000, late: 0, dueThisMonth: 0 },
      { personId: danery.id, name: 'Danery', owedToMe: 700, iOwe: 50, net: 650, late: 400, dueThisMonth: 300 },
    ])
  })

  it('should create one row per installment and month', async () => {
    mockRepository.createMany.mockImplementation(async (rows) => rows)

    const rows = await service.create({
      direction: DebtDirection.OWED_TO_ME,
      description: 'Iphone 16',
      amount: 400,
      personId: danery.id,
      paymentMonth: 12,
      paymentYear: 2026,
      installments: 3,
    })

    expect(
      rows.map(({ installment, paymentMonth, paymentYear, amountInPen }) => [
        installment,
        paymentMonth,
        paymentYear,
        amountInPen,
      ]),
    ).toEqual([
      ['1/3', 12, 2026, 400],
      ['2/3', 1, 2027, 400],
      ['3/3', 2, 2027, 400],
    ])
  })

  describe('payments from the web', () => {
    it('should register a payment up to the balance', async () => {
      mockRepository.findById.mockResolvedValue({ ...buildDebt({ paidAmount: 150 }), payments: [] })

      await service.addPayment('debt-1', { amount: 250 })

      expect(mockRepository.addPayment).toHaveBeenCalledWith({
        debtId: 'debt-1',
        amount: 250,
        paidAt: new Date('2026-09-23T17:00:00Z'),
        paymentMethodId: null,
        notes: null,
      })
    })

    it('should refuse a payment greater than the balance', async () => {
      mockRepository.findById.mockResolvedValue({ ...buildDebt({ paidAmount: 150 }), payments: [] })

      await expect(service.addPayment('debt-1', { amount: 250.01 })).rejects.toThrow(DebtPaymentExceedsBalanceException)
      expect(mockRepository.addPayment).not.toHaveBeenCalled()
    })
  })

  describe('payments from the bot', () => {
    const open = [buildDebt({ id: 'aug', paymentMonth: 8 }), buildDebt({ id: 'sep', paymentMonth: 9 })]

    it('should propose covering the oldest installments, without confirming anything', async () => {
      mockRepository.findOpen.mockResolvedValue(open)

      const proposal = await service.proposePayment(danery.id, DebtDirection.OWED_TO_ME, 500)

      expect(mockRepository.findOpen).toHaveBeenCalledWith({ personId: danery.id, direction: DebtDirection.OWED_TO_ME })
      const [batchId, allocations] = mockRepository.replaceProposal.mock.calls[0]
      expect(batchId).toMatch(/^[0-9a-f]{20}$/)
      expect(allocations).toEqual([
        { debtId: 'aug', amount: 400 },
        { debtId: 'sep', amount: 100 },
      ])
      expect(proposal).toMatchObject({ batchId, excess: 0, items: [{ amount: 400 }, { amount: 100 }] })
      expect(mockRepository.confirmProposal).not.toHaveBeenCalled()
    })

    it('should return null when the person has nothing open (the text is a new expense then)', async () => {
      mockRepository.findOpen.mockResolvedValue([])

      await expect(service.proposePayment(danery.id, DebtDirection.I_OWE, 50)).resolves.toBeNull()
      expect(mockRepository.replaceProposal).not.toHaveBeenCalled()
    })

    it('should move the whole amount to the installment picked, up to its balance', async () => {
      const paidAt = new Date('2026-09-23T16:00:00Z')
      mockRepository.findProposal.mockResolvedValue([
        { amount: 400, paidAt, debt: open[0] },
        { amount: 100, paidAt, debt: open[1] },
      ])
      mockRepository.findOpen.mockResolvedValue(open)

      const proposal = await service.pickInstallment('batch-1', 'sep')

      expect(mockRepository.replaceProposal).toHaveBeenCalledWith(
        'batch-1',
        [{ debtId: 'sep', amount: 400 }],
        paidAt,
        null,
      )
      expect(proposal).toMatchObject({ items: [{ debt: { id: 'sep' }, amount: 400 }], excess: 100 })
    })

    it('should confirm the proposal and give back the installments with their balance', async () => {
      mockRepository.findProposal.mockResolvedValue([{ amount: 400, debt: open[0] }])
      mockRepository.confirmProposal.mockResolvedValue([
        { ...open[0], person: undefined, paidAmount: 400, status: DebtStatus.PAID },
      ])

      const updated = await service.confirmPayment('batch-1')

      expect(updated).toEqual([expect.objectContaining({ id: 'aug', balance: 0, person: danery })])
    })

    it('should do nothing with an expired proposal', async () => {
      mockRepository.findProposal.mockResolvedValue([])

      await expect(service.confirmPayment('old')).resolves.toBeNull()
      await expect(service.pickInstallment('old', 'sep')).resolves.toBeNull()
      expect(mockRepository.confirmProposal).not.toHaveBeenCalled()
    })
  })
})
