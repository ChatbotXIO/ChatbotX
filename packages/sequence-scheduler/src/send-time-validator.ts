export interface SendTimeWindow {
  anytime: boolean
  sendDays: string | null
  sendTimeEnd: string | null
  sendTimeStart: string | null
}

export function calculateNextValidSendTime(
  baseTime: Date,
  window: SendTimeWindow,
): Date {
  if (window.anytime) {
    return baseTime
  }

  const result = new Date(baseTime)
  const allowedDays = parseSendDays(window.sendDays)

  let attempts = 0
  const maxAttempts = 14

  while (attempts < maxAttempts) {
    const dayName = getDayName(result)

    if (!allowedDays.includes(dayName)) {
      result.setDate(result.getDate() + 1)
      result.setHours(0, 0, 0, 0)
      attempts++
      continue
    }

    if (window.sendTimeStart && window.sendTimeEnd) {
      const [startHour, startMin] = window.sendTimeStart.split(":").map(Number)
      const [endHour, endMin] = window.sendTimeEnd.split(":").map(Number)

      const currentHour = result.getHours()
      const currentMin = result.getMinutes()
      const currentTimeInMin = currentHour * 60 + currentMin
      const startTimeInMin = startHour * 60 + startMin
      const endTimeInMin = endHour * 60 + endMin

      if (currentTimeInMin < startTimeInMin) {
        result.setHours(startHour, startMin, 0, 0)
        return result
      }

      if (currentTimeInMin >= endTimeInMin) {
        result.setDate(result.getDate() + 1)
        result.setHours(0, 0, 0, 0)
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
    return [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]
  }

  try {
    const parsed = JSON.parse(sendDays)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]
  }
}

function getDayName(date: Date): string {
  const days = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]
  return days[date.getDay()]
}
