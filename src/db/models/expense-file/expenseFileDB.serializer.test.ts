import { ExpenseFileDBSerializer } from './expenseFileDB.serializer'
import { mockExpenseFileRow } from './mocks/expenseFileDB.mock'

describe('ExpenseFileDBSerializer', () => {
  const serializer = new ExpenseFileDBSerializer()

  it('should parse the JSON columns', () => {
    const dto = serializer.toDto(mockExpenseFileRow)

    expect(dto.confidence).toEqual({ amount: 0.95 })
    expect(dto.missingFields).toEqual(['personId'])
    expect(dto.description).toBe('almuerzo')
  })

  it('should fall back to empty values when the JSON columns are corrupt', () => {
    const dto = serializer.toDto({ ...mockExpenseFileRow, confidence: '{bad', missingFields: 'bad' })

    expect(dto.confidence).toEqual({})
    expect(dto.missingFields).toEqual([])
  })

  it('should stringify only the JSON fields present in the update', () => {
    expect(serializer.toUpdateData({ missingFields: [], amount: 30 })).toEqual({ missingFields: '[]', amount: 30 })
    expect(serializer.toUpdateData({ status: 'saved' })).toEqual({ status: 'saved' })
  })
})
