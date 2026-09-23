import { Injectable } from '@nestjs/common'

import { PrismaService } from '@/db/prisma/prisma.service'

import { PersonDbDto } from './personDB.dto'
import { PersonDBSerializer } from './personDB.serializer'

@Injectable()
export class PersonDBRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly serializer: PersonDBSerializer,
  ) {}

  // Catalog injected into the AI prompt to resolve names and aliases
  async findActive(): Promise<PersonDbDto[]> {
    const persons = await this.prisma.person.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } })
    return this.serializer.toDtoArray(persons)
  }
}
