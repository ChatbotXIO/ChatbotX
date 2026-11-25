export const POSTGRES_TIMESTAMP_WITH_OFFSET =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|[+-](\d{2})(?::?(\d{2}))?)$/

/** Whether `value` is a PostgreSQL timestamp with offset whose date, time and offset are all in range. */
export const isValidPostgresTimestampWithOffset = (value: string): boolean => {
  const match = POSTGRES_TIMESTAMP_WITH_OFFSET.exec(value)
  if (!match) {
    return false
  }

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetHourText,
    offsetMinuteText,
  ] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const offsetHour = offsetHourText ? Number(offsetHourText) : undefined
  const offsetMinute = offsetMinuteText ? Number(offsetMinuteText) : undefined

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (offsetHour === undefined ||
      (offsetHour <= 23 && (offsetMinute === undefined || offsetMinute <= 59)))
  )
}
