import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { PrismaService } from '@/db/prisma/prisma.service'

import { PersonDBRepository } from './personDB.repository'
import { PersonDBSerializer } from './personDB.serializer'

const mockPrismaService = {
  person: {
    findMany: vi.fn(),
  },
}

describe('PersonDBRepository', () => {
  let repository: PersonDBRepository

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PersonDBRepository, PersonDBSerializer, { provide: PrismaService, useValue: mockPrismaService }],
    }).compile()

    repository = module.get<PersonDBRepository>(PersonDBRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return active people with their aliases parsed', async () => {
    mockPrismaService.person.findMany.mockResolvedValue([
      { id: 'p1', name: 'Danery', aliases: '["dany","mi esposa"]', isActive: true },
    ])

    const people = await repository.findActive()

    expect(mockPrismaService.person.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
    expect(people[0].aliases).toEqual(['dany', 'mi esposa'])
  })
})
