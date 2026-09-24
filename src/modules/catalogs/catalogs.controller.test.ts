import { Test, TestingModule } from '@nestjs/testing'
import { vi } from 'vitest'

import { PaymentMethodType } from '@/commons/constants/catalog.constant'
import { BudgetGroupDBRepository } from '@/db/models/budget-group/budgetGroupDB.repository'
import { CategoryDBRepository } from '@/db/models/category/categoryDB.repository'
import { PaymentMethodDBRepository } from '@/db/models/payment-method/paymentMethodDB.repository'
import { PersonDBRepository } from '@/db/models/person/personDB.repository'

import {
  BudgetGroupsController,
  CategoriesController,
  PaymentMethodsController,
  PeopleController,
} from './catalogs.controller'

const people = { findAll: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn() }
const methods = { findAll: vi.fn(), createFull: vi.fn(), update: vi.fn(), deactivate: vi.fn() }
const categories = { findAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }
const groups = { findAll: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() }

// Catalogs of kogane-app (P7): the controllers hand the validated body to their repository (errors are mapped there)
describe('Catalogs controllers', () => {
  let module: TestingModule

  beforeEach(async () => {
    module = await Test.createTestingModule({
      controllers: [PeopleController, PaymentMethodsController, CategoriesController, BudgetGroupsController],
      providers: [
        { provide: PersonDBRepository, useValue: people },
        { provide: PaymentMethodDBRepository, useValue: methods },
        { provide: CategoryDBRepository, useValue: categories },
        { provide: BudgetGroupDBRepository, useValue: groups },
      ],
    })
      // ApiKeyGuard and the rest of the app are not under test here
      .useMocker(() => ({}))
      .compile()
  })

  afterEach(() => vi.clearAllMocks())

  it('should list, create, edit and deactivate people (Configuración ▸ Personas, D80)', async () => {
    const controller = module.get(PeopleController)
    await controller.findAll()
    await controller.create({ name: 'Brenda', aliases: ['mi hermana'] })
    await controller.update('person-1', { isActive: false })
    await controller.deactivate('person-1')

    expect(people.findAll).toHaveBeenCalled()
    expect(people.create).toHaveBeenCalledWith({ name: 'Brenda', aliases: ['mi hermana'] })
    expect(people.update).toHaveBeenCalledWith('person-1', { isActive: false })
    expect(people.deactivate).toHaveBeenCalledWith('person-1')
  })

  it('should turn a card off for the menu and the bot (Cuentas y tarjetas)', async () => {
    const controller = module.get(PaymentMethodsController)
    await controller.create({ name: 'Ripley', type: PaymentMethodType.CREDIT_CARD, billingCloseDay: 25 })
    await controller.update('method-1', { isActive: false, showInBot: false })

    expect(methods.createFull).toHaveBeenCalledWith({ name: 'Ripley', type: 'credit_card', billingCloseDay: 25 })
    expect(methods.update).toHaveBeenCalledWith('method-1', { isActive: false, showInBot: false })
  })

  it('should manage categories and budget groups', async () => {
    await module.get(CategoriesController).delete('category-1')
    await module.get(BudgetGroupsController).update('group-1', { percentage: 40 })

    expect(categories.delete).toHaveBeenCalledWith('category-1')
    expect(groups.update).toHaveBeenCalledWith('group-1', { percentage: 40 })
  })
})
