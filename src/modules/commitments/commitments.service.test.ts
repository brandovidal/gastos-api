import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { CommitmentKind, CommitmentStatus, CommitmentSubtype } from '@/commons/constants/commitment.constant'
import { CommitmentPlanIncompleteException } from '@/commons/exceptions/commitment/commitment-plan-incomplete.exception'
import { ContributionNotFoundException } from '@/commons/exceptions/commitment/contribution-not-found.exception'
import { CommitmentDBRepository } from '@/db/models/commitment/commitmentDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'
import { AttachmentsService } from '@/modules/attachments/attachments.service'

import { CommitmentsService } from './commitments.service'

const mockCommitments = {
  findMany: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  addInstallments: vi.fn(),
  findContributions: vi.fn(),
  findContribution: vi.fn(),
  createContribution: vi.fn(),
  updateContribution: vi.fn(),
  deleteContribution: vi.fn(),
  sumContributions: vi.fn(),
}
const mockPeople = { findDefault: vi.fn() }
const mockAttachments = { counts: vi.fn(), removeOf: vi.fn() }

const PLAN = {
  name: 'BCP',
  kind: CommitmentKind.LOAN,
  subtype: CommitmentSubtype.LOAN,
  installmentCount: 36,
  installmentAmount: 1950.76,
  dueDay: 31,
  startMonth: 11,
  startYear: 2025,
  categoryId: 'cat-1',
}

const installment = (number: number, paymentStatus: string) => ({
  id: `f${number}`,
  installment: `${number}/2`,
  paymentMonth: number,
  paymentYear: 2026,
  amount: 100,
  paymentStatus,
  dueDate: null,
  paymentDate: null,
})
const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  status: CommitmentStatus.ACTIVE,
  installmentCount: 2,
  currency: 'PEN',
  installments: [],
  ...overrides,
})

describe('CommitmentsService', () => {
  let service: CommitmentsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommitmentsService,
        { provide: CommitmentDBRepository, useValue: mockCommitments },
        { provide: PersonDBRepository, useValue: mockPeople },
        { provide: AttachmentsService, useValue: mockAttachments },
      ],
    }).compile()
    service = module.get(CommitmentsService)

    mockPeople.findDefault.mockResolvedValue({ id: 'me' })
    mockAttachments.counts.mockResolvedValue(new Map())
    mockCommitments.sumContributions.mockResolvedValue([])
    mockCommitments.findContributions.mockResolvedValue([])
    mockCommitments.create.mockResolvedValue({ id: 'c1' })
    mockCommitments.findById.mockResolvedValue(stored())
  })

  afterEach(() => vi.resetAllMocks())

  describe('create', () => {
    it('should create the commitment with one fixed cost per installment on its due day', async () => {
      await service.create({ ...PLAN })

      const [data, rows] = mockCommitments.create.mock.calls[0]
      expect(data).toEqual(expect.objectContaining({ personId: 'me', totalAmount: 70227.36, status: 'active' }))
      expect(rows).toHaveLength(36)
      expect(rows[0]).toEqual(
        expect.objectContaining({
          description: 'BCP',
          installment: '1/36',
          paymentMonth: 11,
          paymentYear: 2025,
          paymentStatus: 'not_started',
          amountInPen: 1950.76,
          categoryId: 'cat-1',
        }),
      )
      // day 31 falls on the last day of shorter months
      expect(rows[1].dueDate).toEqual(new Date('2025-12-31T00:00:00.000Z'))
      expect(rows[3].dueDate).toEqual(new Date('2026-02-28T00:00:00.000Z'))
    })

    it('should not create installments when asked not to, or when there is no plan', async () => {
      await service.create({ ...PLAN, createInstallments: false })
      await service.create({ name: 'Bitcoin', kind: CommitmentKind.INVESTMENT, subtype: CommitmentSubtype.CRYPTO })

      expect(mockCommitments.create.mock.calls.map(([, rows]) => rows)).toEqual([[], []])
    })

    it('should say what is missing when it must create installments and cannot', async () => {
      await expect(service.create({ ...PLAN, categoryId: undefined })).rejects.toMatchObject({
        response: expect.objectContaining({ details: { missing: ['categoryId'] } }),
      })
      await expect(
        service.create({ ...PLAN, createInstallments: true, dueDay: undefined, startYear: undefined }),
      ).rejects.toThrow(CommitmentPlanIncompleteException)
      expect(mockCommitments.create).not.toHaveBeenCalled()
    })
  })

  describe('progress', () => {
    it('should turn an active commitment into paid when every installment is paid', async () => {
      mockCommitments.findMany.mockResolvedValue([
        stored({ installments: [installment(1, 'paid'), installment(2, 'paid')] }),
        stored({ id: 'c2', installments: [installment(1, 'paid'), installment(2, 'not_started')] }),
        stored({
          id: 'c3',
          status: CommitmentStatus.CANCELLED,
          installments: [installment(1, 'paid'), installment(2, 'paid')],
        }),
      ])

      const list = await service.list({})

      expect(list.map((row) => row.status)).toEqual(['paid', 'active', 'cancelled'])
      expect(list[1].progress).toEqual(expect.objectContaining({ paidCount: 1, remainingCount: 1, pendingAmount: 100 }))
    })

    it('should sum the contributions of an investment without installments', async () => {
      mockCommitments.findMany.mockResolvedValue([stored({ installmentCount: null })])
      mockCommitments.sumContributions.mockResolvedValue([
        { commitmentId: 'c1', currency: 'PEN', _sum: { amount: 300.5, quantity: null }, _count: { _all: 2 } },
      ])

      const [row] = await service.list({})

      expect(row).toEqual(expect.objectContaining({ progress: null, contributionCount: 2, contributedAmount: 300.5 }))
    })
  })

  describe('createMissingInstallments', () => {
    it('should create only the numbers that do not exist yet', async () => {
      mockCommitments.findById.mockResolvedValue({
        ...stored(),
        ...PLAN,
        installmentCount: 4,
        installments: [installment(1, 'paid'), { ...installment(3, 'paid'), installment: '3/4' }],
      })
      mockCommitments.addInstallments.mockResolvedValue(2)

      const result = await service.createMissingInstallments('c1')

      expect(
        mockCommitments.addInstallments.mock.calls[0][1].map((row: { installment: string }) => row.installment),
      ).toEqual(['2/4', '4/4'])
      expect(result).toEqual({ created: 2 })
    })
  })

  describe('contributions', () => {
    it('should not touch a contribution of another commitment', async () => {
      mockCommitments.findContribution.mockResolvedValue({ id: 'k1', commitmentId: 'other' })

      await expect(service.deleteContribution('c1', 'k1')).rejects.toThrow(ContributionNotFoundException)
      expect(mockCommitments.deleteContribution).not.toHaveBeenCalled()
    })

    it('should default the currency to the one of the commitment', async () => {
      mockCommitments.findById.mockResolvedValue(stored({ currency: 'USD' }))
      mockCommitments.createContribution.mockImplementation(async (data) => ({ id: 'k1', ...data }))

      await service.addContribution('c1', { date: new Date('2026-09-01'), amount: 50 })

      expect(mockCommitments.createContribution).toHaveBeenCalledWith(expect.objectContaining({ currency: 'USD' }))
    })
  })

  describe('delete', () => {
    it('should remove the files of the commitment and of its contributions', async () => {
      mockCommitments.findContributions.mockResolvedValue([{ id: 'k1' }, { id: 'k2' }])

      await service.delete('c1')

      expect(mockAttachments.removeOf.mock.calls).toEqual([
        [['commitment'], 'c1'],
        [['contribution'], 'k1'],
        [['contribution'], 'k2'],
      ])
    })
  })
})
