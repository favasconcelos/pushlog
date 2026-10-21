import { PushlogError } from '@/util/errors'

const pad = (n: number) => String(n).padStart(2, '0')
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Local calendar day as YYYY-MM-DD. */
export function formatDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function daysAgo(days: number, now: Date = new Date()): string {
  return formatDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days))
}

function isRealDay(day: string): boolean {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

/** `today`, `yesterday`, `YYYY-MM-DD`, or `N` (N days ago) to a YYYY-MM-DD day. */
export function resolveDate(input: string, now: Date = new Date()): string {
  if (input === 'today') return daysAgo(0, now)
  if (input === 'yesterday') return daysAgo(1, now)
  if (/^\d{4}-\d{2}-\d{2}$/.test(input) && isRealDay(input)) return input
  if (/^\d{1,3}$/.test(input)) return daysAgo(Number(input), now)
  throw new PushlogError(`Invalid date "${input}" (use today, yesterday, YYYY-MM-DD or N).`)
}

/** The range for `--days N`: the last N days, including today. */
export function lastDays(count: number, now: Date = new Date()): { since: string; until: string } {
  return { since: daysAgo(count - 1, now), until: daysAgo(0, now) }
}

/** Local day of a timestamp, as YYYY-MM-DD. */
export const dayOf = (ms: number) => formatDay(new Date(ms))

export function clockOf(ms: number): string {
  const date = new Date(ms)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `MM-DD HH:MM`, for timestamps shown outside a single-day view. */
export function monthDayClockOf(ms: number): string {
  return `${dayOf(ms).slice(5)} ${clockOf(ms)}`
}

/** `Tue 2026-10-20` */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${day}`
}
