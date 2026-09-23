import { PaymentMethod } from '@/generated/prisma/client'

export type PaymentMethodDbDto = Omit<PaymentMethod, 'aliases'> & { aliases: string[] }
