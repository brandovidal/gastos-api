import { Injectable } from '@nestjs/common'

import { RecurringExpense } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { RecurringTargetType } from '@/commons/constants/expense.constant'

// The row a recurring expense creates in its table for one month
export interface GeneratedRowDbDto {
  targetType: RecurringTargetType
  data: Record<string, unknown>
}

export type RecurringWithCard = RecurringExpense & {
  paymentMethod: { type: string; billingCloseDay: number | null } | null
}

// Recurring expenses (P20, D88): `lastGeneratedAt` is the first day (00:00 UTC) of the last month generated, so the
// job of the 1st and "Generar" in the web never create the same month twice
@Injectable()
export class RecurringExpenseDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(): Promise<RecurringWithCard[]> {
    return this.prisma.recurringExpense.findMany({
      where: { isActive: true },
      include: { paymentMethod: { select: { type: true, billingCloseDay: true } } },
      orderBy: { dayOfMonth: 'asc' },
    })
  }

  findDefaultCategoryId(): Promise<string | null> {
    return this.prisma.category
      .findFirst({ where: { isDefault: true }, select: { id: true } })
      .then((category) => category?.id ?? null)
  }

  // Creates the row and marks the month in one transaction. Returns the new row id, or null when that month (or a
  // later one) was already generated
  async generate(
    recurringId: string,
    monthStart: Date,
    { targetType, data }: GeneratedRowDbDto,
  ): Promise<string | null> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.recurringExpense.updateMany({
        where: { id: recurringId, OR: [{ lastGeneratedAt: null }, { lastGeneratedAt: { lt: monthStart } }] },
        data: { lastGeneratedAt: monthStart },
      })
      if (count === 0) return null

      const created =
        targetType === RecurringTargetType.FIXED_COST
          ? await tx.fixedCost.create({ data: data as never, select: { id: true } })
          : targetType === RecurringTargetType.SUBSCRIPTION
            ? await tx.subscription.create({ data: data as never, select: { id: true } })
            : await tx.creditCardExpense.create({ data: data as never, select: { id: true } })
      return created.id
    })
  }
}
