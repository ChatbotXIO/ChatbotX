import { format } from "date-fns"

const DATE_TIME_PATTERN = "yyyy/MM/dd HH:mm"
const EMPTY_DATE = "—"

export const formatDateTime = (date: Date): string =>
  format(date, DATE_TIME_PATTERN)

/** `formatDateTime`, or a dash for a date that has not happened yet. */
export const formatOptionalDateTime = (
  date: Date | null | undefined,
): string => (date ? formatDateTime(date) : EMPTY_DATE)
