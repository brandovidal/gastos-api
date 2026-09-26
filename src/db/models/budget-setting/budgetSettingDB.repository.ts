import { Injectable } from '@nestjs/common'

import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { RECURRING_KINDS, SubscriptionKind } from '@/commons/constants/expense.constant'
import { BudgetSetting } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { requireUserId } from '@/db/tenant/tenant-context'

export type BudgetSettingsDbDto = Pick<BudgetSetting, 'recurringCount' | 'platformsCount'>
export type BudgetSettingsUpdateDbDto = Partial<BudgetSettingsDbDto>

export const DEFAULT_BUDGET_SETTINGS: BudgetSettingsDbDto = { recurringCount: true, platformsCount: false }

// Subscription kinds that add to the budget with these switches (D96, D107); paid with a credit card they never do
export function countedSubscriptionKinds(settings: BudgetSettingsDbDto): string[] {
  return [
    ...(settings.platformsCount ? [SubscriptionKind.PLATFORM] : []),
    ...(settings.recurringCount ? RECURRING_KINDS : []),
  ]
}

export const subscriptionCounts = (
  settings: BudgetSettingsDbDto,
  kind: string,
  paymentMethodType: string | null | undefined,
) => paymentMethodType !== PaymentMethodType.CREDIT_CARD && countedSubscriptionKinds(settings).includes(kind)

// Configuración ▸ Presupuesto (one row per user, P23): what adds to the budget besides fixed costs, cards and day to day
@Injectable()
export class BudgetSettingDBRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<BudgetSettingsDbDto> {
    const row = await this.prisma.budgetSetting.findUnique({ where: { userId: requireUserId() } })
    return row ? { recurringCount: row.recurringCount, platformsCount: row.platformsCount } : DEFAULT_BUDGET_SETTINGS
  }

  async update(changes: BudgetSettingsUpdateDbDto): Promise<BudgetSettingsDbDto> {
    const row = await this.prisma.budgetSetting.upsert({
      where: { userId: requireUserId() },
      create: { userId: requireUserId(), ...DEFAULT_BUDGET_SETTINGS, ...changes },
      update: changes,
    })
    return { recurringCount: row.recurringCount, platformsCount: row.platformsCount }
  }
}
