import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { PrismaService } from '@/db/prisma/prisma.service'
import { PaymentMethodType } from '@/commons/constants/catalog.constant'

import { PaymentMethodDBRepository } from './paymentMethodDB.repository'
import { PaymentMethodDBSerializer } from './paymentMethodDB.serializer'

const mockPrismaService = {
  paymentMethod: {
    findMany: vi.fn(),
  },
}

describe('PaymentMethodDBRepository', () => {
  let repository: PaymentMethodDBRepository

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodDBRepository,
        PaymentMethodDBSerializer,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile()

    repository = module.get<PaymentMethodDBRepository>(PaymentMethodDBRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return active payment methods with their aliases parsed', async () => {
    mockPrismaService.paymentMethod.findMany.mockResolvedValue([
      { id: 'pm1', name: 'OhPay', type: PaymentMethodType.CREDIT_CARD, aliases: '["oh","la oh"]', isActive: true },
    ])

    const paymentMethods = await repository.findActive()

    expect(mockPrismaService.paymentMethod.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
    expect(paymentMethods[0].aliases).toEqual(['oh', 'la oh'])
  })
})
