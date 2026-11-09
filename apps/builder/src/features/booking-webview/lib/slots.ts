export type Slot = {
  startAt: string
  endAt: string
}

/** How far ahead the booking pickers load slots. */
export const DEFAULT_SLOT_WINDOW_DAYS = 90

export const timezoneOptions = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Ho_Chi_Minh",
  "Asia/Singapore",
  "Asia/Tokyo",
]

export function getDateKey(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(new Date(value))
}

export function groupSlotsByDate(slots: Slot[], timezone: string) {
  const grouped = new Map<string, Slot[]>()
  for (const slot of slots) {
    const key = getDateKey(slot.startAt, timezone)
    grouped.set(key, [...(grouped.get(key) ?? []), slot])
  }
  return grouped
}

export function calendarDateToKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function dateKeyToCalendarDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12)
}

export function formatDateLabel(date: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(`${date}T12:00:00.000Z`))
}

export function formatTimeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value))
}

export function formatFullLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value))
}
