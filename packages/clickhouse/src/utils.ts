import { formatInTimeZone } from "date-fns-tz"

export function toClickHouseDateTime(date: Date): string {
  return formatInTimeZone(date, "UTC", "yyyy-MM-dd HH:mm:ss")
}
