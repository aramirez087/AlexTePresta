const CR_TZ = 'America/Costa_Rica'

const CR_DATE_FMT = new Intl.DateTimeFormat('es-CR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: CR_TZ,
})

export function formatDate(d: Date): string {
  return CR_DATE_FMT.format(d)
}

export function daysUntil(d: Date): number {
  // Use YYYY-MM-DD in CR timezone to avoid DST / UTC offset errors
  const isoFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: CR_TZ })
  const todayStr = isoFormatter.format(new Date())
  const targetStr = isoFormatter.format(d)
  const todayMs = new Date(todayStr + 'T00:00:00').getTime()
  const targetMs = new Date(targetStr + 'T00:00:00').getTime()
  return Math.round((targetMs - todayMs) / 86_400_000)
}
