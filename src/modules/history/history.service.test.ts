import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { AuditChangeDBRepository } from '@/db/models/audit/auditChangeDB.repository'

import { HistoryService } from './history.service'

const mockRepository = { findPage: vi.fn(), namesOf: vi.fn(), titlesOf: vi.fn() }

const row = (overrides: Record<string, unknown>) => ({
  id: 'a1',
  entity: 'exp_fixed_costs',
  entityId: 'f1',
  action: 'update',
  changes: '{}',
  source: 'web',
  actorId: null,
  batchId: null,
  createdAt: new Date('2026-09-26T10:00:00.000Z'),
  ...overrides,
})

describe('HistoryService', () => {
  let service: HistoryService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HistoryService, { provide: AuditChangeDBRepository, useValue: mockRepository }],
    }).compile()
    service = module.get(HistoryService)
    mockRepository.namesOf.mockResolvedValue([])
    mockRepository.titlesOf.mockResolvedValue([])
  })

  afterEach(() => vi.resetAllMocks())

  it('should read an update as before → after and name the record from the table', async () => {
    mockRepository.findPage.mockResolvedValue({
      rows: [row({ changes: JSON.stringify({ amount: [1000, 1042], paymentStatus: ['pending', 'paid'] }) })],
      total: 1,
    })
    mockRepository.titlesOf.mockResolvedValue([{ id: 'f1', title: 'Terreno' }])

    const page = await service.list({ page: 1 })

    expect(page.items[0]).toEqual(
      expect.objectContaining({
        title: 'Terreno',
        changes: [
          { field: 'amount', before: 1000, after: 1042 },
          { field: 'paymentStatus', before: 'pending', after: 'paid' },
        ],
      }),
    )
    expect(mockRepository.titlesOf).toHaveBeenCalledWith('exp_fixed_costs', 'description', 'id', ['f1'])
  })

  it('should keep the whole row of a delete and its name, when the row is gone', async () => {
    mockRepository.findPage.mockResolvedValue({
      rows: [row({ action: 'delete', changes: JSON.stringify({ description: 'Zapatillas', amount: 150 }) })],
      total: 1,
    })

    const [entry] = (await service.list({ page: 1 })).items

    expect(entry.title).toBe('Zapatillas')
    expect(entry.changes).toEqual([
      { field: 'description', before: 'Zapatillas', after: null },
      { field: 'amount', before: 150, after: null },
    ])
  })

  it('should give the name of the people and cards a change points to', async () => {
    mockRepository.findPage.mockResolvedValue({
      rows: [row({ changes: JSON.stringify({ personId: ['p1', 'p2'] }) })],
      total: 1,
    })
    mockRepository.namesOf.mockResolvedValue([
      { id: 'p1', name: 'Brando' },
      { id: 'p2', name: 'Danery' },
    ])

    const page = await service.list({ page: 1 })

    expect(mockRepository.namesOf).toHaveBeenCalledWith('person', ['p1', 'p2'])
    expect(page.labels).toEqual({ p1: 'Brando', p2: 'Danery' })
  })

  it('should ask for the timeline of one record', async () => {
    mockRepository.findPage.mockResolvedValue({ rows: [], total: 0 })

    await service.timeline('exp_debts', 'd1', 2)

    expect(mockRepository.findPage).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'exp_debts', entityId: 'd1' }),
      2,
      30,
    )
  })

  it('should survive a change that is not JSON', async () => {
    mockRepository.findPage.mockResolvedValue({ rows: [row({ changes: 'nope' })], total: 1 })

    expect((await service.list({ page: 1 })).items[0].changes).toEqual([])
  })
})
