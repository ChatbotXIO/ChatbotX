export function startOfHour(date: Date): Date {
  const result = new Date(date)
  result.setMinutes(0, 0, 0)
  return result
}

export function endOfHour(date: Date): Date {
  const result = new Date(date)
  result.setMinutes(59, 59, 999)
  return result
}

export interface TimeRangeRow {
  endTime: Date | string | null
  startTime: Date | string
}

export function rehydrateTimeRangeDates<T extends TimeRangeRow>(
  rows: T[],
): Array<T & { startTime: Date; endTime: Date | null }> {
  return rows.map((row) => ({
    ...row,
    startTime: new Date(row.startTime),
    endTime: row.endTime ? new Date(row.endTime) : null,
  }))
}
