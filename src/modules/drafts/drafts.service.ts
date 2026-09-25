import { randomUUID } from 'node:crypto'

import { Injectable } from '@nestjs/common'

import {
  ExpenseDraftChannel,
  ExpenseDraftInputType,
  ExpenseDraftStatus,
  NEW_EXPENSE_DRAFT_STATUSES,
  WEB_CHAT_ID,
} from '@/commons/constants/expense-draft.constant'
import { ExpenseDraftNotFoundException } from '@/commons/exceptions/expense-draft/expense-draft-not-found.exception'
import { ExpenseDraftDbDto } from '@/db/models/expense-draft/expenseDraftDB.dto'
import { ExpenseDraftDBRepository } from '@/db/models/expense-draft/expenseDraftDB.repository'
import { ConversationService } from '@/modules/conversation/conversation.service'
import { ExpenseSaverService } from '@/modules/conversation/expense-saver.service'
import { toExpenseDraftUpdate, toExpenseFields } from '@/modules/conversation/expense-draft.mapper'
import { ExpenseExtractionService } from '@/modules/expense-extraction/expense-extraction.service'
import { findDefaultPerson } from '@/modules/expense-extraction/expense-extraction.catalog'
import { completeExpense } from '@/modules/expense-extraction/expense-extraction.resolver'
import { ResolvedExpenseFields } from '@/modules/expense-extraction/dto/expense-extraction.types'
import { StoredFilesService } from '@/modules/stored-files/stored-files.service'

import { DraftFieldsDto, DraftListQueryDto } from './dto/request/drafts.dto'
import { DraftTab } from './validations/drafts.validation'

const TAB_STATUSES: Record<DraftTab, ExpenseDraftStatus[]> = {
  // an /editar copy in progress (editing) belongs to the chat, not to Borrador
  [DraftTab.REVIEW]: [...NEW_EXPENSE_DRAFT_STATUSES, ExpenseDraftStatus.PENDING_REVIEW],
  [DraftTab.FAILED]: [ExpenseDraftStatus.FAILED],
  [DraftTab.DISCARDED]: [ExpenseDraftStatus.DISCARDED],
}

// Borrador and Nuevo gasto in kogane-app (D50, D57). Every save goes through ExpenseSaverService, like the bot.
@Injectable()
export class DraftsService {
  constructor(
    private readonly expenseDraftDBRepository: ExpenseDraftDBRepository,
    private readonly expenseExtractionService: ExpenseExtractionService,
    private readonly expenseSaverService: ExpenseSaverService,
    private readonly conversationService: ConversationService,
    private readonly storedFilesService: StoredFilesService,
  ) {}

  list({ tab, limit, offset }: DraftListQueryDto) {
    return this.expenseDraftDBRepository.findForReview(TAB_STATUSES[tab], limit, offset)
  }

  async get(id: string) {
    const expenseDraft = await this.find(id)
    const mediaUrl = await this.storedFilesService.signedUrl(expenseDraft.fileId)
    return { ...expenseDraft, mediaUrl }
  }

  async create(fields: DraftFieldsDto) {
    const expenseDraft = await this.expenseDraftDBRepository.create({
      channel: ExpenseDraftChannel.WEB,
      chatId: WEB_CHAT_ID,
      messageId: randomUUID(),
      inputType: ExpenseDraftInputType.MANUAL,
    })
    return this.applyFields(expenseDraft, fields)
  }

  async update(id: string, fields: DraftFieldsDto) {
    return this.applyFields(await this.find(id), fields)
  }

  async save(id: string) {
    const expenseDraft = await this.find(id)
    const saved = await this.expenseSaverService.save(expenseDraft)
    return { draftId: id, destination: expenseDraft.destination, recordId: saved.id }
  }

  discard(id: string) {
    return this.expenseDraftDBRepository.update(id, { status: ExpenseDraftStatus.DISCARDED, pendingField: null })
  }

  async retry(id: string) {
    await this.conversationService.retryExtraction(await this.find(id))
    return this.get(id)
  }

  // kind and supplyNumber only come from the web (Recurrentes, D107): the AI fields know nothing about them
  private async applyFields(
    expenseDraft: ExpenseDraftDbDto,
    { sharedWith, kind, supplyNumber, ...fields }: DraftFieldsDto,
  ) {
    const catalog = await this.expenseExtractionService.loadCatalog()
    const merged: ResolvedExpenseFields = {
      ...toExpenseFields(expenseDraft),
      ...(fields as Partial<ResolvedExpenseFields>),
    }
    merged.personId ??= findDefaultPerson(catalog)?.id ?? null
    const shares = sharedWith === undefined ? expenseDraft.sharedWith : sharedWith?.shares.length ? sharedWith : null
    if (shares?.shares.some((share) => share.personId === merged.personId)) {
      merged.personId = findDefaultPerson(catalog)?.id ?? merged.personId
    }

    const confidence = { ...expenseDraft.confidence }
    for (const [field, value] of Object.entries(fields)) if (value != null) confidence[field] = 1

    const update = toExpenseDraftUpdate(completeExpense(merged, confidence, catalog))
    return this.expenseDraftDBRepository.update(expenseDraft.id, {
      ...update,
      ...(sharedWith !== undefined ? { sharedWith: shares } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(supplyNumber !== undefined ? { supplyNumber } : {}),
      status: update.status === ExpenseDraftStatus.DISCARDED ? update.status : ExpenseDraftStatus.PENDING_REVIEW,
      pendingField: null,
    })
  }

  private async find(id: string) {
    const expenseDraft = await this.expenseDraftDBRepository.findById(id)
    if (!expenseDraft) throw new ExpenseDraftNotFoundException({ id })
    return expenseDraft
  }
}
