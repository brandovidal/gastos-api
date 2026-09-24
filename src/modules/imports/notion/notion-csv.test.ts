import { parseCsv } from './notion-csv'

describe('parseCsv', () => {
  it('should read a Notion export: BOM, quoted commas and quotes, CRLF, and skip empty lines', () => {
    const text =
      '\uFEFFDescripción,Pago,Observacion\r\n"Cena, pollería","1,200.50","dijo ""gracias"""\r\n\r\nUber,20,\r\n'

    expect(parseCsv(text)).toEqual({
      headers: ['Descripción', 'Pago', 'Observacion'],
      rows: [
        { line: 2, values: { Descripción: 'Cena, pollería', Pago: '1,200.50', Observacion: 'dijo "gracias"' } },
        { line: 4, values: { Descripción: 'Uber', Pago: '20', Observacion: '' } },
      ],
    })
  })

  it('should keep line breaks inside a quoted field', () => {
    expect(parseCsv('A,B\n"uno\ndos",3').rows[0].values).toEqual({ A: 'uno\ndos', B: '3' })
  })
})
