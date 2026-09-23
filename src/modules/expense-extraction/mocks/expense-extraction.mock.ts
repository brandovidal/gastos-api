import { Category, CreditCard } from '@/generated/prisma/client'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { PersonDbDto } from '@/db/models/person/personDB.dto'
import { PaymentMethodDbDto } from '@/db/models/payment-method/paymentMethodDB.dto'

import { ExtractedExpense } from '../dto/expense-extraction.types'

const timestamps = { createdAt: new Date('2026-09-01'), updatedAt: new Date('2026-09-01') }

export const mockPeople: PersonDbDto[] = [
  { id: 'person-brando', name: 'Brando', aliases: ['yo', 'yuji'], isActive: true, isDefault: true, ...timestamps },
  {
    id: 'person-danery',
    name: 'Danery',
    aliases: ['dany', 'mi esposa'],
    isActive: true,
    isDefault: false,
    ...timestamps,
  },
]

export const mockCreditCards: CreditCard[] = [
  { id: 'card-oh', code: 'OH', name: 'Oh Visa', billingCloseDay: 20, paymentDueDay: 5, color: null, ...timestamps },
]

export const mockPaymentMethods: PaymentMethodDbDto[] = [
  {
    id: 'method-yape',
    name: 'Yape',
    type: PaymentMethodType.WALLET,
    aliases: ['yapee'],
    isActive: true,
    creditCardId: null,
    ...timestamps,
  },
  {
    id: 'method-ohpay',
    name: 'OhPay',
    type: PaymentMethodType.CREDIT_CARD,
    aliases: ['la oh'],
    isActive: true,
    creditCardId: 'card-oh',
    ...timestamps,
  },
]

export const mockCategories: Category[] = [
  {
    id: 'category-food',
    name: 'Comida',
    color: '#000000',
    icon: null,
    isDefault: false,
    budgetGroupId: null,
    ...timestamps,
  },
]

export const mockCatalogSource = {
  people: mockPeople,
  paymentMethods: mockPaymentMethods,
  creditCards: mockCreditCards,
  categories: mockCategories,
}

export const mockExtractedExpense: ExtractedExpense = {
  destination: null,
  description: 'Almuerzo',
  amount: 25,
  currency: null,
  spentAt: null,
  expenseType: 'essential' as ExtractedExpense['expenseType'],
  installment: null,
  period: null,
  personRef: 'p2',
  paymentMethodRef: 'pm1',
  creditCardRef: null,
  categoryRef: 'cat1',
  merchant: null,
  operationNumber: null,
  notes: null,
  confidence: { description: 0.95, amount: 0.99, personRef: 0.5 },
}
