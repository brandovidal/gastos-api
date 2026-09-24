import { detectScreen, parseDate, parseMoney, recognizeText, RecognizedScreen } from './recognition.templates'

// OCR texts with the exact structure tesseract.js returned for real screenshots (docs/files, 2026-09-23), with
// merchants, people and amounts changed: real receipts never go to git
const IO_PURCHASE_DETAIL = `6:18
ul
=
<
Detalle de categoría
U
E-COMMERCE
1consumo
CONSUMO TOTAL EN SEPTIEMBRE 4977
S/1,200.00
S/1,200.00
$0.00
14 Sep 2026
TIENDA ONLI...
os
Virtual / 10 cuotas
-S/1,200.00`

const IO_CATEGORY_SUMMARY = `6:18
1 = ED
Movimientos
CONSUMO TOTAL EN SEPTIEMBRE
S/3,000.50
S/2,950.00
Sep
E-COMMERCE
S/1,200.00
1consumo
40.27%
RESTAURANTES
S/500.00
1
2 consumos
14.41%
DELIVERY
S/300.25
14 consumos
10.86%`

const IO_MOVEMENTS_LIST = `Movimientos
CONSUMO TOTAL EN SEPTIEMBRE
S/3,000.50
22 Sep 2026
TAXI UNO
Virtual
-S/0.00
DELIVERY FO...
EN PROCESO
Virtual
-S/30.90`

const BANK_MOVEMENT = `LJ Interbank
LE
Detalle de movimiento
s/-80.002
19 Set 2026 | 3:57 PM
Tipo de operación
Plin-Rosa
Fecha del proceso
21 Set 2026`

const YAPE_RECEIPT = `¡Yapeaste!
«S Compartir
Rosa Q*
8 22 set. 2026 | O 1:30 p.m.
Nro. de operación
00112233`

describe('recognition templates', () => {
  describe('money and dates', () => {
    it.each([
      ['-S/1,649.00', { amount: 1649, currency: 'PEN', negative: true }],
      ['s/-100.002', { amount: 100, currency: 'PEN', negative: true }],
      ['S/4,095.23', { amount: 4095.23, currency: 'PEN', negative: false }],
      ['-$20.00', { amount: 20, currency: 'USD', negative: true }],
    ])('should read "%s"', (line, expected) => {
      expect(parseMoney(line)).toEqual(expected)
    })

    it.each([
      ['14 Sep 2026', '2026-09-14'],
      ['19 Set 2026 | 3:57 PM', '2026-09-19'],
      ['8 22 set. 2026 | O 1:30 p.m.', '2026-09-22'],
      ['1 = ED', null],
    ])('should read the date of "%s"', (line, expected) => {
      expect(parseDate(line)).toBe(expected)
    })
  })

  it.each([
    [IO_PURCHASE_DETAIL, RecognizedScreen.IO_PURCHASE_DETAIL],
    [IO_CATEGORY_SUMMARY, RecognizedScreen.IO_CATEGORY_SUMMARY],
    [BANK_MOVEMENT, RecognizedScreen.BANK_MOVEMENT],
    [IO_MOVEMENTS_LIST, null],
    [YAPE_RECEIPT, null],
  ])('should tell the screen apart (%#)', (text, screen) => {
    expect(detectScreen(text)).toBe(screen)
  })

  it('should read a purchase in cuotas of IO: one installment of the total, the date of the purchase (D45)', () => {
    expect(recognizeText(IO_PURCHASE_DETAIL)).toEqual({
      screen: RecognizedScreen.IO_PURCHASE_DETAIL,
      expenses: [
        {
          merchant: 'TIENDA ONLI',
          amount: 120,
          total: 1200,
          currency: 'PEN',
          spentAt: '2026-09-14',
          installments: 10,
          bankCategory: 'E-COMMERCE',
          pending: false,
          card: 'primary',
          transfer: null,
          counterpart: null,
        },
      ],
    })
  })

  it('should give the purchase detail to the AI when it read fewer purchases than the app counts', () => {
    expect(recognizeText(IO_PURCHASE_DETAIL.replace('1consumo', '2 consumos'))).toBeNull()
  })

  it('should read the month summary by category without creating expenses', () => {
    expect(recognizeText(IO_CATEGORY_SUMMARY)).toEqual({
      screen: RecognizedScreen.IO_CATEGORY_SUMMARY,
      month: 9,
      total: 3000.5,
      categories: [
        { name: 'E-COMMERCE', amount: 1200, count: 1 },
        { name: 'RESTAURANTES', amount: 500, count: 2 },
        { name: 'DELIVERY', amount: 300.25, count: 14 },
      ],
    })
  })

  it('should read a Plin of Interbank with the operation date, not the process date', () => {
    expect(recognizeText(BANK_MOVEMENT)).toMatchObject({
      screen: RecognizedScreen.BANK_MOVEMENT,
      expenses: [{ amount: 80, spentAt: '2026-09-19', transfer: 'Plin', counterpart: 'Rosa', card: null }],
    })
  })

  it('should leave Yape and the list of movements to the AI (D63)', () => {
    expect(recognizeText(YAPE_RECEIPT)).toBeNull()
    expect(recognizeText(IO_MOVEMENTS_LIST)).toBeNull()
  })
})
