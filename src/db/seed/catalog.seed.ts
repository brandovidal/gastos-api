import { PrismaClient } from '@/generated/prisma/client'
import { JsonHelper } from '@/commons/helpers/json.helper'

import { BUDGET_GROUPS, CATEGORIES, PAYMENT_METHODS, PEOPLE } from './catalog.seed.data'

export interface CatalogSeedResult {
  people: number
  paymentMethods: number
  budgetGroups: number
  categories: number
}

// Idempotent: upserts by unique name/code, so it can run again after editing catalog.seed.data.ts.
// Aliases are replaced by the ones in the data file; rows not listed there are left untouched.
export async function seedCatalogs(prisma: PrismaClient): Promise<CatalogSeedResult> {
  for (const { name, aliases = [], isDefault = false } of PEOPLE) {
    const data = { aliases: JsonHelper.stringify(aliases), isDefault, isActive: true }
    await prisma.person.upsert({ where: { name }, create: { name, ...data }, update: data })
  }

  for (const { name, aliases, showInBot = true, ...method } of PAYMENT_METHODS) {
    const data = { ...method, aliases: JsonHelper.stringify(aliases), showInBot, isActive: true }
    await prisma.paymentMethod.upsert({ where: { name }, create: { name, ...data }, update: data })
  }

  const groupIdByName = new Map<string, string>()
  for (const { name, ...group } of BUDGET_GROUPS) {
    const saved = await prisma.budgetGroup.upsert({ where: { name }, create: { name, ...group }, update: group })
    groupIdByName.set(name, saved.id)
  }

  for (const { name, budgetGroup, ...category } of CATEGORIES) {
    const data = { ...category, isDefault: true, budgetGroupId: groupIdByName.get(budgetGroup) ?? null }
    await prisma.category.upsert({ where: { name }, create: { name, ...data }, update: data })
  }

  return {
    people: PEOPLE.length,
    paymentMethods: PAYMENT_METHODS.length,
    budgetGroups: BUDGET_GROUPS.length,
    categories: CATEGORIES.length,
  }
}
