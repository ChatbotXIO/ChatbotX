import type { DateTimeTriggerType } from "@aha.chat/database/enums"
import { addDays, addHours, subDays, subHours } from "date-fns"

export type DateTimeOperator = "before" | "after" | "atTheDayOf"
export type DateTimeUnit = "minutes" | "hours" | "days"

export interface DateTimeCondition {
  operator: DateTimeOperator
  value?: number
  unit?: DateTimeUnit
  at?: string // Hour of day (0-23) for atTheDayOf
  customFieldId: string
}

export type DateTimeTriggerValue = {
  triggerType: DateTimeTriggerType
  at: string
  timeValue: number
  timeType: "hours" | "days" | "minutes"
}

export function calculateTargetDateTime(
  operator: DateTimeOperator,
  value: number,
  unit: DateTimeUnit,
  referenceDate: Date = new Date(),
): Date {
  if (operator === "atTheDayOf") {
    return referenceDate
  }

  const absValue = Math.abs(value)

  if (operator === "before") {
    if (unit === "minutes") {
      return subHours(referenceDate, absValue / 60)
    }
    if (unit === "hours") {
      return subHours(referenceDate, absValue)
    }
    return subDays(referenceDate, absValue)
  }

  if (operator === "after") {
    if (unit === "minutes") {
      return addHours(referenceDate, absValue / 60)
    }
    if (unit === "hours") {
      return addHours(referenceDate, absValue)
    }
    return addDays(referenceDate, absValue)
  }

  return referenceDate
}

export function matchesDateTimeCondition(
  datetimeValue: Date,
  condition: DateTimeCondition,
): boolean {
  const now = new Date()

  switch (condition.operator) {
    case "before":
    case "after": {
      if (!(condition.value && condition.unit)) {
        return false
      }

      const targetDate = calculateTargetDateTime(
        condition.operator,
        condition.value,
        condition.unit,
        datetimeValue,
      )

      const diffInMinutes =
        Math.abs(now.getTime() - targetDate.getTime()) / (1000 * 60)

      const toleranceByUnit = {
        minutes: 1,
        hours: 30,
        days: 60 * 2,
      }

      const tolerance = toleranceByUnit[condition.unit] || 1
      return diffInMinutes <= tolerance
    }
    case "atTheDayOf": {
      const targetHour = condition.at ? Number.parseInt(condition.at, 10) : 9

      const isSameDay =
        now.getFullYear() === datetimeValue.getFullYear() &&
        now.getMonth() === datetimeValue.getMonth() &&
        now.getDate() === datetimeValue.getDate()

      if (!isSameDay) {
        return false
      }

      const currentMinutes = now.getHours() * 60 + now.getMinutes()
      const targetMinutes = targetHour * 60
      const diffInMinutes = Math.abs(currentMinutes - targetMinutes)

      return diffInMinutes <= 30
    }
    default:
      return false
  }
}

const TIMEZONE_REGEX = /Z|[+-]\d{2}:\d{2}$/
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function parseDateTimeValue(value: unknown): Date | null {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value
  }

  if (typeof value === "string") {
    let dateString = value.trim()

    if (!TIMEZONE_REGEX.test(dateString)) {
      if (DATE_ONLY_REGEX.test(dateString)) {
        dateString = `${dateString}T00:00:00Z`
      } else if (!dateString.endsWith("Z")) {
        dateString = `${dateString}Z`
      }
    }

    const parsed = new Date(dateString)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  if (typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}
