export class DateHelper {
  // YYYY-MM-DD of the given instant in a timezone
  static todayIn(timeZone: string, now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  }

  static addDays(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T00:00:00.000Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }

  // Instant when the current day started in a timezone (e.g. when a daily quota was reset)
  static startOfDayIn(timeZone: string, now: Date = new Date()): Date {
    const utcMidnight = new Date(`${DateHelper.todayIn(timeZone, now)}T00:00:00.000Z`)
    return new Date(utcMidnight.getTime() - DateHelper.offsetMs(timeZone, utcMidnight))
  }

  private static offsetMs(timeZone: string, date: Date): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)

    return (
      Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - date.getTime()
    )
  }
}
