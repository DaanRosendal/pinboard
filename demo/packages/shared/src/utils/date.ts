export function formatDate(date: Date, locale = "en-US"): string {
  return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })
}

export function isExpired(date: Date): boolean {
  return date < new Date()
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
