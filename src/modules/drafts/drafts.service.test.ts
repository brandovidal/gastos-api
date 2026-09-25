import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { ExpenseDestination, SubscriptionKind } from '@/commons/constants/expense.constant'
import { ExpenseDraftStatus } from '@/commons/constants/expense-draft.constant'
import { ExpenseDraftNotFoundException } from '@/commons/exceptions/expense-draft/expense-draft-not-found.exception'
import { ExpenseDraftDBRepository } from '@/db/models/expense-draft/expenseDraftDB.repository'
import { ConversationService } from '@/modules/conversation/conversation.service'
import { ExpenseSaverService } from '@/modules/conversation/expense-saver.service'
import { buildExpenseDraft, mockCatalog } from '@/modules/conversation/mocks/conversation.mock'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { DraftsService } from './drafts.service'
import { DraftTab } from './validations/drafts.validation'

const mockExpenseDraftDB = { findForReview: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn() }
const mockExtraction = { loadCatalog: vi.fn() }
const mockSaver = { save: vi.fn() }
const mockConversation = { retryExtraction: vi.fn() }
const mockStoredFiles = { signedUrl: vi.fn() }

describe('DraftsService', () => {
  let service: DraftsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DraftsService,
        { provide: ExpenseDraftDBRepository, useValue: mockExpenseDraftDB },
        { provide: ExpenseExtractionService, useValue: mockExtraction },
        { provide: ExpenseSaverService, useValue: mockSaver },
        { provide: ConversationService, useValue: mockConversation },
        { provide: StoredFilesService, useValue: mockStoredFiles },
      ],
    }).compile()
    service = module.get(DraftsService)

    mockExtraction.loadCatalog.mockResolvedValue(mockCatalog)
    mockExpenseDraftDB.create.mockImplementation(async (data) =>
      buildExpenseDraft({ ...data, personId: null, missingFields: [] }),
    )
    mockExpenseDraftDB.update.mockImplementation(async (id, data) => buildExpenseDraft({ id, ...data }))
  })

  afterEach(() => vi.clearAllMocks())

  it('should list Borrador by tab', async () => {
    await service.list({ tab: DraftTab.REVIEW, limit: 30, offset: 0 })

    expect(mockExpenseDraftDB.findForReview).toHaveBeenCalledWith(
      [ExpenseDraftStatus.DRAFT, ExpenseDraftStatus.AWAITING_CONFIRMATION, ExpenseDraftStatus.PENDING_REVIEW],
      30,
      0,
    )
  })

  it('should create Nuevo gasto as a web draft for the default person, kept in Borrador (D57)', async () => {
    await service.create({
      destination: ExpenseDestination.DAILY,
      description: 'Almuerzo',
      amount: 25,
      paymentMethodId: 'method-yape',
    })

    expect(mockExpenseDraftDB.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'web', chatId: 'web', inputType: 'manual' }),
    )
    expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        personId: 'person-brando',
        amount: 25,
        status: ExpenseDraftStatus.PENDING_REVIEW,
        pendingField: null,
      }),
    )
  })

  it('should keep the split of a shared expense and make the user the payer (D73, D78)', async () => {
    const sharedWith = { shares: [{ personId: 'person-danery', ratio: 0.5 }] }

    await service.create({
      destination: ExpenseDestination.DAILY,
      description: 'Cena',
      amount: 120,
      personId: 'person-danery',
      sharedWith,
    })

    expect(mockExpenseDraftDB.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sharedWith, personId: 'person-brando' }),
    )
  })

  it('should stop sharing with an empty split and leave the split alone when it is not sent', async () => {
    mockExpenseDraftDB.findById.mockResolvedValue(
      buildExpenseDraft({ sharedWith: { shares: [{ personId: 'person-danery', ratio: 0.5 }] } }),
    )

    await service.update('draft-1', { sharedWith: { shares: [] } })
    expect(mockExpenseDraftDB.update).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ sharedWith: null }),
    )

    await service.update('draft-1', { amount: 30 })
    expect(mockExpenseDraftDB.update.mock.lastCall?.[1]).not.toHaveProperty('sharedWith')
  })

  it('should keep the kind and supply number of a new Recurrente, which the AI fields do not carry (D107)', async () => {
    await service.create({
      destination: ExpenseDestination.SUBSCRIPTION,
      description: 'Bitel Papa',
      amount: 29.9,
      kind: SubscriptionKind.SERVICE,
      supplyNumber: '987654321',
    })
    expect(mockExpenseDraftDB.update).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ kind: SubscriptionKind.SERVICE, supplyNumber: '987654321' }),
    )

    mockExpenseDraftDB.findById.mockResolvedValue(buildExpenseDraft({ kind: SubscriptionKind.SERVICE }))
    await service.update('draft-1', { amount: 30 })
    expect(mockExpenseDraftDB.update.mock.lastCall?.[1]).not.toHaveProperty('kind')
  })

  it('should save through ExpenseSaverService like the bot', async () => {
    mockExpenseDraftDB.findById.mockResolvedValue(buildExpenseDraft({ id: 'draft-1' }))
    mockSaver.save.mockResolvedValue({ id: 'record-1', installments: null, budget: null })

    expect(await service.save('draft-1')).toEqual({
      draftId: 'draft-1',
      destination: 'fixed_cost',
      recordId: 'record-1',
    })
  })

  it('should give a signed link to the file and answer 404 for an unknown draft', async () => {
    mockExpenseDraftDB.findById.mockResolvedValueOnce(buildExpenseDraft({ fileId: 'stored-1' }))
    mockStoredFiles.signedUrl.mockResolvedValue('https://r2/signed')
    expect(await service.get('draft-1')).toMatchObject({ mediaUrl: 'https://r2/signed' })

    mockExpenseDraftDB.findById.mockResolvedValueOnce(null)
    await expect(service.get('missing')).rejects.toBeInstanceOf(ExpenseDraftNotFoundException)
  })

  it('should discard and retry', async () => {
    await service.discard('draft-1')
    expect(mockExpenseDraftDB.update).toHaveBeenCalledWith('draft-1', {
      status: ExpenseDraftStatus.DISCARDED,
      pendingField: null,
    })

    mockExpenseDraftDB.findById.mockResolvedValue(buildExpenseDraft())
    await service.retry('draft-1')
    expect(mockConversation.retryExtraction).toHaveBeenCalled()
  })
})
