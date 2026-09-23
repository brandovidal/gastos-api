import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import {
  ExpenseDraftChannel,
  ExpenseDraftStatus,
  OPEN_EXPENSE_DRAFT_STATUSES,
} from '@/commons/constants/expense-draft.constant'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { DuplicateExpenseDraftException } from '@/commons/exceptions/expense-draft/duplicate-expense-draft.exception'
import { ExpenseDraftNotFoundException } from '@/commons/exceptions/expense-draft/expense-draft-not-found.exception'

import { CreateExpenseDraftDbDto, ExpenseDraftDbDto, UpdateExpenseDraftDbDto } from './expenseDraftDB.dto'
import { ExpenseDraftDBSerializer } from './expenseDraftDB.serializer'

@Injectable()
export class ExpenseDraftDBRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serializer: ExpenseDraftDBSerializer,
  ) {}

  async create(data: CreateExpenseDraftDbDto): Promise<ExpenseDraftDbDto> {
    try {
      const expenseDraft = await this.prisma.expenseDraft.create({ data })
      return this.serializer.toDto(expenseDraft)
    } catch (error) {
      // The same channel message delivered twice (webhook retry) must not create a second expense draft
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_CONSTRAINT)) {
        const { channel, chatId, messageId, itemIndex } = data
        throw new DuplicateExpenseDraftException({ channel, chatId, messageId, itemIndex: itemIndex ?? 0 })
      }
      throw error
    }
  }

  async findById(id: string): Promise<ExpenseDraftDbDto | null> {
    const expenseDraft = await this.prisma.expenseDraft.findUnique({ where: { id } })
    return expenseDraft ? this.serializer.toDto(expenseDraft) : null
  }

  // The open expense draft is the conversation state of a chat
  async findOpenByChat(
    channel: ExpenseDraftChannel,
    chatId: string,
    updatedAfter: Date,
  ): Promise<ExpenseDraftDbDto | null> {
    const expenseDraft = await this.prisma.expenseDraft.findFirst({
      where: { channel, chatId, status: { in: OPEN_EXPENSE_DRAFT_STATUSES }, updatedAt: { gte: updatedAfter } },
      orderBy: { updatedAt: 'desc' },
    })
    return expenseDraft ? this.serializer.toDto(expenseDraft) : null
  }

  async update(id: string, data: UpdateExpenseDraftDbDto): Promise<ExpenseDraftDbDto> {
    try {
      const expenseDraft = await this.prisma.expenseDraft.update({
        where: { id },
        data: this.serializer.toUpdateData(data),
      })
      return this.serializer.toDto(expenseDraft)
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) {
        throw new ExpenseDraftNotFoundException({ id })
      }
      throw error
    }
  }

  // Open drafts nobody confirmed in time go to Borrador (D50) instead of being lost
  async moveStaleOpenToReview(channel: ExpenseDraftChannel, chatId: string, before: Date): Promise<number> {
    const { count } = await this.prisma.expenseDraft.updateMany({
      where: { channel, chatId, status: { in: OPEN_EXPENSE_DRAFT_STATUSES }, updatedAt: { lt: before } },
      data: { status: ExpenseDraftStatus.PENDING_REVIEW, pendingField: null },
    })
    return count
  }

  // Drafts whose AI extraction never finished (process restarted mid-request): still `draft`, with no question
  // asked and no extracted data. They become `failed` so /borrador can retry them. Returns the affected chats.
  async failInterruptedUpdatedBefore(
    channel: ExpenseDraftChannel,
    before: Date,
    chatId?: string,
  ): Promise<{ chatId: string; count: number }[]> {
    const where = {
      channel,
      ...(chatId ? { chatId } : {}),
      status: ExpenseDraftStatus.DRAFT,
      pendingField: null,
      destination: null,
      description: null,
      amount: null,
      updatedAt: { lt: before },
    }
    const interrupted = await this.prisma.expenseDraft.findMany({ where, select: { id: true, chatId: true } })
    if (!interrupted.length) return []

    await this.prisma.expenseDraft.updateMany({
      where: { id: { in: interrupted.map(({ id }) => id) } },
      data: { status: ExpenseDraftStatus.FAILED },
    })

    const countByChat = new Map<string, number>()
    for (const draft of interrupted) countByChat.set(draft.chatId, (countByChat.get(draft.chatId) ?? 0) + 1)
    return [...countByChat].map(([chat, count]) => ({ chatId: chat, count }))
  }

  // The same image sent again (same file unique id); discarded ones do not count
  async findByMediaUniqueId(
    channel: ExpenseDraftChannel,
    chatId: string,
    mediaUniqueId: string,
  ): Promise<ExpenseDraftDbDto | null> {
    const expenseDraft = await this.prisma.expenseDraft.findFirst({
      where: { channel, chatId, mediaUniqueId, status: { not: ExpenseDraftStatus.DISCARDED } },
      orderBy: { createdAt: 'desc' },
    })
    return expenseDraft ? this.serializer.toDto(expenseDraft) : null
  }

  // A saved expense with the same receipt operation number: probably registered twice (text and screenshot)
  async existsSavedWithOperationNumber(operationNumber: string, excludeId: string): Promise<boolean> {
    const count = await this.prisma.expenseDraft.count({
      where: { operationNumber, status: ExpenseDraftStatus.SAVED, id: { not: excludeId } },
    })
    return count > 0
  }

  // /cancelar: close every open expense draft of the chat
  async discardOpenByChat(channel: ExpenseDraftChannel, chatId: string): Promise<number> {
    const { count } = await this.prisma.expenseDraft.updateMany({
      where: { channel, chatId, status: { in: OPEN_EXPENSE_DRAFT_STATUSES } },
      data: { status: ExpenseDraftStatus.DISCARDED, pendingField: null },
    })
    return count
  }

  // /ultimos
  async findRecentSaved(channel: ExpenseDraftChannel, chatId: string, limit: number): Promise<ExpenseDraftDbDto[]> {
    const expenseDrafts = await this.prisma.expenseDraft.findMany({
      where: { channel, chatId, status: ExpenseDraftStatus.SAVED },
      orderBy: { confirmedAt: 'desc' },
      take: limit,
    })
    return expenseDrafts.map((expenseDraft) => this.serializer.toDto(expenseDraft))
  }

  // /borrador: expenses pending review of the chat, newest first
  async findByStatuses(
    channel: ExpenseDraftChannel,
    chatId: string,
    statuses: ExpenseDraftStatus[],
    limit: number,
  ): Promise<{ items: ExpenseDraftDbDto[]; total: number }> {
    const where = { channel, chatId, status: { in: statuses } }
    const [expenseDrafts, total] = await Promise.all([
      this.prisma.expenseDraft.findMany({ where, orderBy: { updatedAt: 'desc' }, take: limit }),
      this.prisma.expenseDraft.count({ where }),
    ])
    return { items: expenseDrafts.map((expenseDraft) => this.serializer.toDto(expenseDraft)), total }
  }

  // Borrador in kogane-app (P7): every channel, newest first
  async findForReview(
    statuses: ExpenseDraftStatus[],
    limit: number,
    offset: number,
  ): Promise<{ items: ExpenseDraftDbDto[]; total: number }> {
    const where = { status: { in: statuses } }
    const [expenseDrafts, total] = await Promise.all([
      this.prisma.expenseDraft.findMany({ where, orderBy: { updatedAt: 'desc' }, take: limit, skip: offset }),
      this.prisma.expenseDraft.count({ where }),
    ])
    return { items: expenseDrafts.map((expenseDraft) => this.serializer.toDto(expenseDraft)), total }
  }

  // Open drafts of one message go back to Borrador (after a retry from the web)
  async parkMessage(channel: ExpenseDraftChannel, chatId: string, messageId: string): Promise<number> {
    const { count } = await this.prisma.expenseDraft.updateMany({
      where: { channel, chatId, messageId, status: { in: OPEN_EXPENSE_DRAFT_STATUSES } },
      data: { status: ExpenseDraftStatus.PENDING_REVIEW, pendingField: null },
    })
    return count
  }
}
