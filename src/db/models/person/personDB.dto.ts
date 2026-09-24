import { Person } from '@/generated/prisma/client'

export type PersonDbDto = Omit<Person, 'aliases'> & { aliases: string[] }

export interface PersonWriteDbDto {
  name: string
  aliases?: string[]
  isDefault?: boolean
  isActive?: boolean
  documentNumber?: string | null
}
