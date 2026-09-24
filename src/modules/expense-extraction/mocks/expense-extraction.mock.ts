import { Category } from '@/generated/prisma/client'
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

const paymentMethod = (overrides: Partial<PaymentMethodDbDto>): PaymentMethodDbDto => ({
  id: 'method',
  name: 'Method',
  type: PaymentMethodType.WALLET,
  code: null,
  aliases: [],
  isActive: true,
  showInBot: true,
  isPrimary: false,
  billingCloseDay: null,
  paymentDueDay: null,
  color: null,
  ...timestamps,
  ...overrides,
})

// Sorted by name like the repository: pm1 OhPay (card), pm2 Tarjeta Oculta (card, hidden in the bot), pm3 Yape
export const mockPaymentMethods: PaymentMethodDbDto[] = [
  paymentMethod({
    id: 'method-ohpay',
    name: 'OhPay',
    type: PaymentMethodType.CREDIT_CARD,
    code: 'OH',
    aliases: ['la oh'],
    billingCloseDay: 10,
    paymentDueDay: 3,
  }),
  paymentMethod({
    id: 'method-hidden',
    name: 'Tarjeta Oculta',
    type: PaymentMethodType.CREDIT_CARD,
    code: 'HID',
    showInBot: false,
  }),
  paymentMethod({ id: 'method-yape', name: 'Yape', type: PaymentMethodType.WALLET, aliases: ['yape'] }),
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
  paymentMethodRef: 'pm3',
  categoryRef: 'cat1',
  merchant: null,
  operationNumber: null,
  notes: null,
  confidence: { description: 0.95, amount: 0.99, personRef: 0.5 },
}
