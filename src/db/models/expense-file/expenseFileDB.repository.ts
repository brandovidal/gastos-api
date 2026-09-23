import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PrismaErrorCode } from '@/commons/constants/database.constant'
import {
  ExpenseFileChannel,
  ExpenseFileStatus,
  OPEN_EXPENSE_FILE_STATUSES,
} from '@/commons/constants/expense-file.constant'
import { isPrismaError } from '@/commons/helpers/prisma-error.helper'
import { DuplicateExpenseFileException } from '@/commons/exceptions/expense-file/duplicate-expense-file.exception'
import { ExpenseFileNotFoundException } from '@/commons/exceptions/expense-file/expense-file-not-found.exception'

import { CreateExpenseFileDbDto, ExpenseFileDbDto, UpdateExpenseFileDbDto } from './expenseFileDB.dto'
import { ExpenseFileDBSerializer } from './expenseFileDB.serializer'

@Injectable()
export class ExpenseFileDBRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serializer: ExpenseFileDBSerializer,
  ) {}

  async create(data: CreateExpenseFileDbDto): Promise<ExpenseFileDbDto> {
    try {
      const expenseFile = await this.prisma.expenseFile.create({ data })
      return this.serializer.toDto(expenseFile)
    } catch (error) {
      // The same channel message delivered twice (webhook retry) must not create a second expense file
      if (isPrismaError(error, PrismaErrorCode.UNIQUE_CONSTRAINT)) {
        const { channel, chatId, messageId, itemIndex } = data
        throw new DuplicateExpenseFileException({ channel, chatId, messageId, itemIndex: itemIndex ?? 0 })
      }
      throw error
    }
  }

  async findById(id: string): Promise<ExpenseFileDbDto | null> {
    const expenseFile = await this.prisma.expenseFile.findUnique({ where: { id } })
    return expenseFile ? this.serializer.toDto(expenseFile) : null
  }

  // The open expense file is the conversation state of a chat
  async findOpenByChat(
    channel: ExpenseFileChannel,
    chatId: string,
    updatedAfter: Date,
  ): Promise<ExpenseFileDbDto | null> {
    const expenseFile = await this.prisma.expenseFile.findFirst({
      where: { channel, chatId, status: { in: OPEN_EXPENSE_FILE_STATUSES }, updatedAt: { gte: updatedAfter } },
      orderBy: { updatedAt: 'desc' },
    })
    return expenseFile ? this.serializer.toDto(expenseFile) : null
  }

  async update(id: string, data: UpdateExpenseFileDbDto): Promise<ExpenseFileDbDto> {
    try {
      const expenseFile = await this.prisma.expenseFile.update({
        where: { id },
        data: this.serializer.toUpdateData(data),
      })
      return this.serializer.toDto(expenseFile)
    } catch (error) {
      if (isPrismaError(error, PrismaErrorCode.RECORD_NOT_FOUND)) {
        throw new ExpenseFileNotFoundException({ id })
      }
      throw error
    }
  }

  async discardOpenUpdatedBefore(channel: ExpenseFileChannel, chatId: string, before: Date): Promise<number> {
    const { count } = await this.prisma.expenseFile.updateMany({
      where: { channel, chatId, status: { in: OPEN_EXPENSE_FILE_STATUSES }, updatedAt: { lt: before } },
      data: { status: ExpenseFileStatus.DISCARDED },
    })
    return count
  }

  // /cancelar: close every open expense file of the chat
  async discardOpenByChat(channel: ExpenseFileChannel, chatId: string): Promise<number> {
    const { count } = await this.prisma.expenseFile.updateMany({
      where: { channel, chatId, status: { in: OPEN_EXPENSE_FILE_STATUSES } },
      data: { status: ExpenseFileStatus.DISCARDED, pendingField: null },
    })
    return count
  }

  // /ultimos
  async findRecentSaved(channel: ExpenseFileChannel, chatId: string, limit: number): Promise<ExpenseFileDbDto[]> {
    const expenseFiles = await this.prisma.expenseFile.findMany({
      where: { channel, chatId, status: ExpenseFileStatus.SAVED },
      orderBy: { confirmedAt: 'desc' },
      take: limit,
    })
    return expenseFiles.map((expenseFile) => this.serializer.toDto(expenseFile))
  }
}
