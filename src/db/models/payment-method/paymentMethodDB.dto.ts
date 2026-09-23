import { PaymentMethod } from '@/generated/prisma/client'

export type PaymentMethodDbDto = Omit<PaymentMethod, 'aliases'> & { aliases: string[] }

export interface PaymentMethodWriteDbDto {
  name: string
  type: string // PaymentMethodType
  code?: string | null
  aliases?: string[]
  isActive?: boolean
  showInBot?: boolean
  billingCloseDay?: number | null
  paymentDueDay?: number | null
  color?: string | null
}
