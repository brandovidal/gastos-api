import { Person } from '@/generated/prisma/client'

export type PersonDbDto = Omit<Person, 'aliases'> & { aliases: string[] }
