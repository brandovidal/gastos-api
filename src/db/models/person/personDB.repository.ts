import { Injectable } from '@nestjs/common'

import { Prisma } from '@/generated/prisma/client'
import { PrismaService } from '@/db/prisma/prisma.service'
import { JsonHelper } from '@/commons/helpers/json.helper'

import { toCatalogError } from '../catalog-error.helper'

import { PersonDbDto, PersonWriteDbDto } from './personDB.dto'
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

  // "You" (D19): the budget counts only this person's expenses (D71)
  async findDefault(): Promise<PersonDbDto | null> {
    const person = await this.prisma.person.findFirst({ where: { isDefault: true } })
    return person ? this.serializer.toDto(person) : null
  }

  // kogane-app (P7): every person, active or not
  async findAll(): Promise<PersonDbDto[]> {
    const people = await this.prisma.person.findMany({ orderBy: { name: 'asc' } })
    return this.serializer.toDtoArray(people)
  }

  async create(data: PersonWriteDbDto): Promise<PersonDbDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (data.isDefault) await tx.person.updateMany({ data: { isDefault: false } })
        const person = await tx.person.create({ data: this.toData(data) as Prisma.PersonCreateInput })
        return this.serializer.toDto(person)
      })
    } catch (error) {
      throw toCatalogError(error, 'person')
    }
  }

  // Only one default person: setting it clears the previous one
  async update(id: string, data: Partial<PersonWriteDbDto>): Promise<PersonDbDto> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (data.isDefault) await tx.person.updateMany({ where: { id: { not: id } }, data: { isDefault: false } })
        const person = await tx.person.update({ where: { id }, data: this.toData(data) })
        return this.serializer.toDto(person)
      })
    } catch (error) {
      throw toCatalogError(error, 'person', id)
    }
  }

  // Expenses point to people: they are deactivated, never deleted
  async deactivate(id: string): Promise<PersonDbDto> {
    return this.update(id, { isActive: false, isDefault: false })
  }

  private toData({ aliases, ...rest }: Partial<PersonWriteDbDto>) {
    return {
      ...rest,
      ...(aliases ? { aliases: JsonHelper.stringify(aliases.map((alias) => alias.toLowerCase())) } : {}),
    }
  }
}
