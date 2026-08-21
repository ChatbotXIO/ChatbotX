export function formatUtcDay(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "")
}
