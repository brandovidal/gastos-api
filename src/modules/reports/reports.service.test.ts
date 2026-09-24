import { Test, TestingModule } from '@nestjs/testing'
import ExcelJS from 'exceljs'
import { vi } from 'vitest'

import { DebtDirection, DebtStatus, DebtTiming } from '@/commons/constants/debt.constant'
import { ReportFormat } from '@/commons/constants/report.constant'
import { DebtsService } from '@/modules/debts/debts.service'

import { ReportsService } from './reports.service'

const mockDebts = { summary: vi.fn(), findOpen: vi.fn() }

const debt = {
  id: 'debt-1',
  direction: DebtDirection.OWED_TO_ME,
  description: 'Iphone 16',
  amount: 500,
  paidAmount: 100,
  balance: 400,
  currency: 'PEN',
  installment: '3/12',
  paymentMonth: 9,
  paymentYear: 2026,
  status: DebtStatus.PARTIAL,
  timing: DebtTiming.LATE,
  personId: 'person-danery',
  person: { id: 'person-danery', name: 'Danery' },
}

describe('ReportsService', () => {
  let service: ReportsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService, { provide: DebtsService, useValue: mockDebts }],
    }).compile()
    service = module.get(ReportsService)

    mockDebts.summary.mockResolvedValue([
      { personId: 'person-danery', name: 'Danery', owedToMe: 400, iOwe: 0, net: 400, late: 400, dueThisMonth: 0 },
      { personId: 'person-juan', name: 'Juan', owedToMe: 0, iOwe: 50, net: -50, late: 0, dueThisMonth: 0 },
    ])
    mockDebts.findOpen.mockResolvedValue([debt])
  })

  afterEach(() => vi.clearAllMocks())

  it('should build the Excel of one person with the summary and the detail of each installment (D39)', async () => {
    const file = await service.debts(ReportFormat.XLSX, 'person-danery')

    expect(file.filename).toMatch(/^deudas-danery-\d{4}-\d{2}-\d{2}\.xlsx$/)
    expect(file.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(mockDebts.findOpen).toHaveBeenCalledWith('person-danery')

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(file.data as unknown as ExcelJS.Buffer)
    const resumen = workbook.getWorksheet('Resumen')!
    const detalle = workbook.getWorksheet('Detalle')!
    expect(resumen.rowCount).toBe(2) // header + Danery only
    expect(resumen.getRow(2).values).toEqual([undefined, 'Danery', 400, 0, 400, 400, 0])
    expect(detalle.getRow(2).values).toEqual([
      undefined,
      'Danery',
      'Me debe',
      'Iphone 16',
      '3/12',
      'set 2026',
      500,
      100,
      400,
      'Abonado',
      'Vencida',
      'PEN',
    ])
  })

  it('should build the PDF of everyone', async () => {
    const file = await service.debts(ReportFormat.PDF)

    expect(file.filename).toMatch(/^deudas-todas-.*\.pdf$/)
    expect(file.mimeType).toBe('application/pdf')
    expect(file.data.subarray(0, 5).toString()).toBe('%PDF-')
    expect(mockDebts.findOpen).toHaveBeenCalledWith(undefined)
  })
})
