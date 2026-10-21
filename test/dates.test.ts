import { describe, expect, it } from 'vitest'
import {
  clockOf,
  dayLabel,
  dayOf,
  daysAgo,
  formatDay,
  lastDays,
  monthDayClockOf,
  resolveDate,
} from '@/core/dates'

const now = new Date(2026, 2, 1, 15, 30) // Sun 2026-03-01 15:30 local

describe('resolveDate', () => {
  it('resolves today and yesterday', () => {
    expect(resolveDate('today', now)).toBe('2026-03-01')
    expect(resolveDate('yesterday', now)).toBe('2026-02-28')
  })

  it('resolves N as N days ago, across month boundaries', () => {
    expect(resolveDate('0', now)).toBe('2026-03-01')
    expect(resolveDate('1', now)).toBe('2026-02-28')
    expect(resolveDate('30', now)).toBe('2026-01-30')
  })

  it('accepts a real YYYY-MM-DD', () => {
    expect(resolveDate('2024-02-29', now)).toBe('2024-02-29')
  })

  it.each(['2026-02-30', '2026-13-01', 'tomorrow', '2026-1-1', '-1', '1000', ''])(
    'rejects %j',
    (input) => {
      expect(() => resolveDate(input, now)).toThrow(/Invalid date/)
    },
  )
})

describe('lastDays', () => {
  it('includes today', () => {
    expect(lastDays(1, now)).toEqual({ since: '2026-03-01', until: '2026-03-01' })
    expect(lastDays(3, now)).toEqual({ since: '2026-02-27', until: '2026-03-01' })
  })
})

describe('formatting', () => {
  it('formats local days and clocks', () => {
    const when = new Date(2026, 9, 5, 7, 4).getTime()
    expect(formatDay(new Date(when))).toBe('2026-10-05')
    expect(dayOf(when)).toBe('2026-10-05')
    expect(clockOf(when)).toBe('07:04')
    expect(monthDayClockOf(when)).toBe('10-05 07:04')
  })

  it('labels a day with its weekday', () => {
    expect(dayLabel('2026-10-20')).toBe('Tue 2026-10-20')
  })

  it('daysAgo is relative to the given date', () => {
    expect(daysAgo(0, now)).toBe('2026-03-01')
  })
})
