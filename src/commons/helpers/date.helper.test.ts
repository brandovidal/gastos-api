import { DateHelper } from './date.helper'

describe('DateHelper', () => {
  // 2026-09-23 03:30 UTC is still 2026-09-22 in Lima (UTC-5) and Los Angeles (UTC-7 in September)
  const now = new Date('2026-09-23T03:30:00.000Z')

  it('should return the local date in a timezone', () => {
    expect(DateHelper.todayIn('America/Lima', now)).toBe('2026-09-22')
    expect(DateHelper.todayIn('UTC', now)).toBe('2026-09-23')
  })

  it('should add days to an ISO date', () => {
    expect(DateHelper.addDays('2026-09-01', -1)).toBe('2026-08-31')
  })

  it('should return the instant when the day started in a timezone', () => {
    expect(DateHelper.startOfDayIn('America/Los_Angeles', now).toISOString()).toBe('2026-09-22T07:00:00.000Z')
    expect(DateHelper.startOfDayIn('America/Lima', now).toISOString()).toBe('2026-09-22T05:00:00.000Z')
    expect(DateHelper.startOfDayIn('UTC', now).toISOString()).toBe('2026-09-23T00:00:00.000Z')
  })
})
