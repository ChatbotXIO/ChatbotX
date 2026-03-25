import {
  addDays,
  getDay,
  getHours,
  getMinutes,
  set,
  startOfDay,
} from "date-fns"

export type SendTimeWindow = {
  anytime: boolean
  sendDays: string | null
  sendTimeEnd: string | null
  sendTimeStart: string | null
}

const ALL_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

const DAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

const MAX_ATTEMPTS = 14

export function calculateNextValidSendTime(
  baseTime: Date,
  window: SendTimeWindow,
): Date {
  if (window.anytime) {
    return baseTime
  }

  let result = new Date(baseTime)
  const allowedDays = new Set(parseSendDays(window.sendDays))

  let startTimeInMin: number | null = null
  let endTimeInMin: number | null = null
  if (window.sendTimeStart && window.sendTimeEnd) {
    startTimeInMin = parseTimeToMinutes(window.sendTimeStart)
    endTimeInMin = parseTimeToMinutes(window.sendTimeEnd)
  }

  let attempts = 0

  while (attempts < MAX_ATTEMPTS) {
    const dayName = getDayName(result)

    if (!allowedDays.has(dayName)) {
      result = startOfDay(addDays(result, 1))
      attempts++
      continue
    }

    if (startTimeInMin !== null && endTimeInMin !== null) {
      const currentHour = getHours(result)
      const currentMin = getMinutes(result)
      const currentTimeInMin = currentHour * 60 + currentMin

      if (currentTimeInMin < startTimeInMin) {
        const [startHour, startMin] = minutesToHourAndMinute(startTimeInMin)
        result = set(result, {
          hours: startHour,
          minutes: startMin,
          seconds: 0,
          milliseconds: 0,
        })
        return result
      }

      if (currentTimeInMin >= endTimeInMin) {
        result = startOfDay(addDays(result, 1))
        attempts++
        continue
      }

      return result
    }

    return result
  }

  return baseTime
}

function parseSendDays(sendDays: string | null): string[] {
  if (!sendDays) {
    return [...ALL_DAYS]
  }

  try {
    const parsed = JSON.parse(sendDays)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [...ALL_DAYS]
  }
}

function parseTimeToMinutes(time: string): number {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

function minutesToHourAndMinute(totalMinutes: number): [number, number] {
  const hour = Math.floor(totalMinutes / 60)
  const minute = totalMinutes % 60
  return [hour, minute]
}

function getDayName(date: Date): string {
  return DAY_NAMES[getDay(date)]
}
