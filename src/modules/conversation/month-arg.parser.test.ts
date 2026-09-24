import { parseMonthArg } from './month-arg.parser'

const TODAY = '2026-09-23'

describe('parseMonthArg', () => {
  it.each([
    ['', { month: 9, year: 2026 }],
    ['octubre', { month: 10, year: 2026 }],
    ['Oct', { month: 10, year: 2026 }],
    ['septiembre', { month: 9, year: 2026 }],
    ['set 2025', { month: 9, year: 2025 }],
    ['10', { month: 10, year: 2026 }],
    ['10 2025', { month: 10, year: 2025 }],
    ['10/2025', { month: 10, year: 2025 }],
  ])('should read "%s"', (args, expected) => {
    expect(parseMonthArg(args, TODAY)).toEqual(expected)
  })

  it.each(['13', 'ma', 'comida', 'octubre 26', 'octubre 2026 extra'])('should not read "%s"', (args) => {
    expect(parseMonthArg(args, TODAY)).toBeNull()
  })
})
