import PDFDocument from 'pdfkit'

import { StatementPasswordException } from '@/commons/exceptions/statement/statement-password.exception'
import { StatementUnreadableException } from '@/commons/exceptions/statement/statement-unreadable.exception'

import { readPdfLines } from './statement-pdf.reader'

// A statement PDF protected with a document number, like the banks send them (D94)
function protectedPdf(password: string): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ userPassword: password, ownerPassword: 'owner' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.fontSize(10).text('ESTADO DE CUENTA SIP', 50, 50)
    doc.text('15/08 MP*MERCADOLI 1/3', 50, 80)
    doc.text('164.90', 400, 80)
    doc.end()
  })
}

describe('readPdfLines', () => {
  it('should open a protected PDF with the document number and join each printed line', async () => {
    const lines = await readPdfLines(await protectedPdf('44556677'), '44556677')
    expect(lines).toEqual(['ESTADO DE CUENTA SIP', '15/08 MP*MERCADOLI 1/3 164.90'])
  })

  it('should say when the password is missing or wrong', async () => {
    const pdf = await protectedPdf('44556677')
    await expect(readPdfLines(pdf, null)).rejects.toMatchObject({
      constructor: StatementPasswordException,
      response: expect.objectContaining({ details: { reason: 'missing' } }),
    })
    await expect(readPdfLines(pdf, '00000000')).rejects.toMatchObject({
      response: expect.objectContaining({ details: { reason: 'incorrect' } }),
    })
  })

  it('should refuse something that is not a PDF', async () => {
    await expect(readPdfLines(Buffer.from('hola'), null)).rejects.toBeInstanceOf(StatementUnreadableException)
  })
})
