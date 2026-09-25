import { Injectable } from '@nestjs/common'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'

import { APP_TIME_ZONE } from '@/commons/constants/app.constant'
import { DebtDirection, DebtStatus, DebtTiming, OPEN_DEBT_STATUSES } from '@/commons/constants/debt.constant'
import { REPORT_MIME_TYPES, ReportFormat } from '@/commons/constants/report.constant'
import { DateHelper } from '@/commons/helpers/date.helper'
import { DebtsService, DebtView, PersonDebtSummary } from '@/modules/debts/debts.service'

export interface ReportFile {
  filename: string
  mimeType: string
  data: Buffer
}

// Spanish labels: the files are for the user (D39)
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']
const DIRECTION_LABELS: Record<string, string> = {
  [DebtDirection.OWED_TO_ME]: 'Me debe',
  [DebtDirection.I_OWE]: 'Le debo',
}
const STATUS_LABELS: Record<string, string> = {
  [DebtStatus.PENDING]: 'Pendiente',
  [DebtStatus.PARTIAL]: 'Abonado',
  [DebtStatus.PREPAID]: 'Amortizado',
  [DebtStatus.PAID]: 'Pagado',
}
const TIMING_LABELS: Record<string, string> = {
  [DebtTiming.UPCOMING]: 'Por venir',
  [DebtTiming.DUE]: 'Este mes',
  [DebtTiming.LATE]: 'Vencida',
}
const MONEY_FORMAT = '"S/" #,##0.00'

const money = (amount: number) =>
  `S/ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const periodOf = (debt: DebtView) => `${MONTHS[debt.paymentMonth - 1]} ${debt.paymentYear}`
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

interface DebtReportData {
  title: string
  today: string
  summary: PersonDebtSummary[]
  detail: DebtView[]
}

// Préstamos y deudas por persona (P17, D39): summary (me debe · le debo · neto) and the open installments
@Injectable()
export class ReportsService {
  constructor(private readonly debtsService: DebtsService) {}

  // Cobros / Deudas (D114): optionally one direction and one payment month, like the page on screen
  async debts(
    format: ReportFormat,
    personId?: string,
    { direction, month, year }: { direction?: DebtDirection; month?: number; year?: number } = {},
  ): Promise<ReportFile> {
    const [summary, detail] = await Promise.all([
      this.debtsService.summary({ month, year }),
      this.debtsService
        .list({ personId, direction, month, year })
        .then((debts) => debts.filter((debt) => OPEN_DEBT_STATUSES.includes(debt.status as DebtStatus))),
    ])
    const rows = personId ? summary.filter((row) => row.personId === personId) : summary
    const name = personId ? (rows[0]?.name ?? detail[0]?.person.name ?? 'persona') : 'todas'
    const today = DateHelper.todayIn(APP_TIME_ZONE)
    const data: DebtReportData = { title: `Deudas · ${name}`, today, summary: rows, detail }

    return {
      filename: `deudas-${slug(name)}-${today}.${format}`,
      mimeType: REPORT_MIME_TYPES[format],
      data: format === ReportFormat.XLSX ? await this.debtsXlsx(data) : await this.debtsPdf(data),
    }
  }

  private async debtsXlsx({ summary, detail }: DebtReportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Kogane'

    const resumen = workbook.addWorksheet('Resumen')
    resumen.columns = [
      { header: 'Persona', key: 'name', width: 22 },
      { header: 'Me debe', key: 'owedToMe', width: 14, style: { numFmt: MONEY_FORMAT } },
      { header: 'Le debo', key: 'iOwe', width: 14, style: { numFmt: MONEY_FORMAT } },
      { header: 'Neto', key: 'net', width: 14, style: { numFmt: MONEY_FORMAT } },
      { header: 'Vencido', key: 'late', width: 14, style: { numFmt: MONEY_FORMAT } },
      { header: 'Este mes', key: 'dueThisMonth', width: 14, style: { numFmt: MONEY_FORMAT } },
    ]
    resumen.addRows(summary)
    if (summary.length > 1) {
      resumen.addRow({
        name: 'Total',
        owedToMe: summary.reduce((sum, row) => sum + row.owedToMe, 0),
        iOwe: summary.reduce((sum, row) => sum + row.iOwe, 0),
        net: summary.reduce((sum, row) => sum + row.net, 0),
        late: summary.reduce((sum, row) => sum + row.late, 0),
        dueThisMonth: summary.reduce((sum, row) => sum + row.dueThisMonth, 0),
      }).font = { bold: true }
    }

    const detalle = workbook.addWorksheet('Detalle')
    detalle.columns = [
      { header: 'Persona', key: 'person', width: 20 },
      { header: 'Tipo', key: 'direction', width: 10 },
      { header: 'Concepto', key: 'description', width: 32 },
      { header: 'Cuota', key: 'installment', width: 8 },
      { header: 'Mes de pago', key: 'period', width: 12 },
      { header: 'Monto', key: 'amount', width: 13, style: { numFmt: MONEY_FORMAT } },
      { header: 'Abonado', key: 'paid', width: 13, style: { numFmt: MONEY_FORMAT } },
      { header: 'Saldo', key: 'balance', width: 13, style: { numFmt: MONEY_FORMAT } },
      { header: 'Estado', key: 'status', width: 12 },
      { header: 'Vence', key: 'timing', width: 10 },
      { header: 'Moneda', key: 'currency', width: 8 },
    ]
    detalle.addRows(
      detail.map((debt) => ({
        person: debt.person.name,
        direction: DIRECTION_LABELS[debt.direction] ?? debt.direction,
        description: debt.description,
        installment: debt.installment ?? '',
        period: periodOf(debt),
        amount: debt.amount,
        paid: debt.paidAmount,
        balance: debt.balance,
        status: STATUS_LABELS[debt.status] ?? debt.status,
        timing: TIMING_LABELS[debt.timing] ?? debt.timing,
        currency: debt.currency,
      })),
    )

    for (const sheet of [resumen, detalle]) {
      sheet.getRow(1).font = { bold: true }
      sheet.views = [{ state: 'frozen', ySplit: 1 }]
    }
    return Buffer.from(await workbook.xlsx.writeBuffer())
  }

  private debtsPdf({ title, today, summary, detail }: DebtReportData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

    doc.font('Helvetica-Bold').fontSize(16).text(title)
    doc.font('Helvetica').fontSize(9).fillColor('#666').text(`Kogane · ${today} · saldos en soles`).fillColor('#000')
    doc.moveDown()

    this.pdfTable(
      doc,
      ['Persona', 'Me debe', 'Le debo', 'Neto', 'Vencido'],
      [170, 85, 85, 85, 85],
      summary.map((row) => [row.name, money(row.owedToMe), money(row.iOwe), money(row.net), money(row.late)]),
    )

    doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Detalle por cuota')
    doc.moveDown(0.3)
    this.pdfTable(
      doc,
      ['Persona', 'Tipo', 'Concepto', 'Cuota', 'Mes', 'Saldo', 'Estado'],
      [80, 50, 150, 40, 55, 70, 70],
      detail.map((debt) => [
        debt.person.name,
        DIRECTION_LABELS[debt.direction] ?? debt.direction,
        debt.description,
        debt.installment ?? '',
        periodOf(debt),
        money(debt.balance),
        debt.timing === DebtTiming.LATE ? 'Vencida' : (STATUS_LABELS[debt.status] ?? debt.status),
      ]),
    )
    if (!detail.length) doc.font('Helvetica').fontSize(10).text('Sin deudas pendientes.')

    doc.end()
    return done
  }

  // A plain table: bold header, one line per row, a new page (with the header again) when it does not fit
  private pdfTable(doc: PDFKit.PDFDocument, headers: string[], widths: number[], rows: string[][]) {
    const left = doc.page.margins.left
    const rowHeight = 16
    const drawRow = (cells: string[], bold: boolean) => {
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage()
        if (!bold) drawRow(headers, true)
      }
      const y = doc.y
      let x = left
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      cells.forEach((cell, index) => {
        doc.text(cell, x, y, { width: widths[index] - 6, height: rowHeight, ellipsis: true, lineBreak: false })
        x += widths[index]
      })
      doc.x = left
      doc.y = y + rowHeight
    }
    drawRow(headers, true)
    rows.forEach((row) => drawRow(row, false))
  }
}
