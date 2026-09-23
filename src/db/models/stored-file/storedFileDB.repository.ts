import { Injectable } from '@nestjs/common'

import { StoredFile } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { REVIEW_EXPENSE_DRAFT_STATUSES } from '@/commons/constants/expense-draft.constant'
import { StoredFileStatus } from '@/commons/constants/stored-file.constant'

export type CreateStoredFileDbDto = Pick<StoredFile, 'channel' | 'storageKey' | 'contentType'> &
  Partial<Pick<StoredFile, 'sizeBytes' | 'sha256' | 'expiresAt'>>

// Where each screenshot / voice note lives in R2 (D58): the database is the source of truth
@Injectable()
export class StoredFileDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateStoredFileDbDto): Promise<StoredFile> {
    return this.prisma.storedFile.create({ data: { ...data, status: StoredFileStatus.TEMPORARY } })
  }

  findById(id: string): Promise<StoredFile | null> {
    return this.prisma.storedFile.findUnique({ where: { id } })
  }

  // Same bytes already in the bucket (temporary or kept): reused instead of uploading a second copy
  findAliveBySha256(sha256: string): Promise<StoredFile | null> {
    return this.prisma.storedFile.findFirst({
      where: { sha256, status: { not: StoredFileStatus.DELETED } },
      orderBy: { createdAt: 'desc' },
    })
  }

  // Drafts that still need the file: still under review, or saved as an expense that still exists
  countUses(fileId: string): Promise<number> {
    return this.prisma.expenseDraft.count({
      where: {
        fileId,
        OR: [
          { status: { in: REVIEW_EXPENSE_DRAFT_STATUSES } },
          { dailyExpense: { isNot: null } },
          { fixedCost: { isNot: null } },
          { subscription: { isNot: null } },
          { creditCardExpense: { isNot: null } },
          { debt: { isNot: null } },
        ],
      },
    })
  }

  extendExpiry(id: string, expiresAt: Date): Promise<StoredFile> {
    return this.prisma.storedFile.update({ where: { id }, data: { expiresAt } })
  }

  markKept(id: string, storageKey: string): Promise<StoredFile> {
    return this.prisma.storedFile.update({
      where: { id },
      data: { status: StoredFileStatus.KEPT, storageKey, keptAt: new Date(), expiresAt: null },
    })
  }

  findExpired(before: Date, limit: number): Promise<StoredFile[]> {
    return this.prisma.storedFile.findMany({
      where: { status: StoredFileStatus.TEMPORARY, expiresAt: { lt: before } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    })
  }

  markDeleted(id: string): Promise<StoredFile> {
    return this.prisma.storedFile.update({
      where: { id },
      data: { status: StoredFileStatus.DELETED, deletedAt: new Date() },
    })
  }
}
