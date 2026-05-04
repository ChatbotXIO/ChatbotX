import { differenceInDays } from "date-fns"

export function getTimeRangeDateFormat(from: Date, to: Date): string {
  return differenceInDays(to, from) > 60 ? "MMM yyyy" : "MMM d"
}
