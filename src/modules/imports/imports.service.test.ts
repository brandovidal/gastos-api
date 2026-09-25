import { strToU8, zipSync } from 'fflate'

import { unpackNotionFiles } from './imports.service'

describe('unpackNotionFiles', () => {
  it('should take the CSV files of a Notion ZIP, also inside the ZIP of the export parts', () => {
    const part = zipSync({
      'Seguimiento financiero/IO 28dbcadcbe208121be76e5a2e957649e_all.csv': strToU8('Descripción,Pago\nUber,20\n'),
      'Seguimiento financiero 28dbcadcbe2081a7bac5f0c40bd47bc2.md': strToU8('# page'),
    })
    const zip = zipSync({ 'Export-Part-1.zip': part, 'Seguimiento financiero/Oh_all.csv': strToU8('a\n') })

    const files = unpackNotionFiles([{ originalname: 'Export.zip', buffer: Buffer.from(zip) }])

    expect(files.map((file) => file.name).sort()).toEqual([
      'Seguimiento financiero/IO 28dbcadcbe208121be76e5a2e957649e_all.csv',
      'Seguimiento financiero/Oh_all.csv',
    ])
    expect(files.find((file) => file.name.includes('IO'))?.content).toBe('Descripción,Pago\nUber,20\n')
  })

  it('should take loose CSV files and ignore anything else', () => {
    const files = unpackNotionFiles([
      { originalname: 'Cuentas_all.csv', buffer: Buffer.from('Descripción\nYape\n') },
      { originalname: 'notas.md', buffer: Buffer.from('#') },
    ])
    expect(files).toEqual([{ name: 'Cuentas_all.csv', content: 'Descripción\nYape\n' }])
  })
})
