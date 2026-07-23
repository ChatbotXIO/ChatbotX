import type { DateTimeTriggerType } from "@chatbotx.io/database/partials"
import { resolveFilterTimezone } from "@chatbotx.io/utils/datetime"
import { addDays, addHours, subDays, subHours } from "date-fns"

export type DateTimeOperator = "before" | "after" | "atTheDayOf"
export type DateTimeUnit = "minutes" | "hours" | "days"

export interface DateTimeCondition {
  at?: string
  customFieldId: string
  timeType?: DateTimeUnit
  timeValue?: number
  /** IANA zone captured at save time; falls back to the workspace zone when absent. */
  timezone?: string
  triggerType: DateTimeOperator
}

export type DateTimeTriggerValue = {
  triggerType: DateTimeTriggerType
  at: string
  timeValue: number
  timeType: "hours" | "days" | "minutes"
  timezone?: string
}

export function calculateTargetDateTime(
  triggerType: DateTimeOperator,
  timeValue: number,
  timeType: DateTimeUnit,
  referenceDate: Date = new Date(),
): Date {
  if (triggerType === "atTheDayOf") {
    return referenceDate
  }

  const absValue = Math.abs(timeValue)

  if (triggerType === "before") {
    if (timeType === "minutes") {
      return subHours(referenceDate, absValue / 60)
    }
    if (timeType === "hours") {
      return subHours(referenceDate, absValue)
    }
    return subDays(referenceDate, absValue)
  }

  if (triggerType === "after") {
    if (timeType === "minutes") {
      return addHours(referenceDate, absValue / 60)
    }
    if (timeType === "hours") {
      return addHours(referenceDate, absValue)
    }
    return addDays(referenceDate, absValue)
  }

  return referenceDate
}

export function matchesDateTimeCondition(
  datetimeValue: Date,
  condition: DateTimeCondition,
  params: { startOfMinute: number },
  timezone = "UTC",
): boolean {
  // Guard the stored zone: a corrupt/crafted value degrades to UTC instead of
  // throwing a RangeError that would crash the whole shared sweep tick.
  const safeTimezone = resolveFilterTimezone(timezone)
  const nowUTC = new Date(params.startOfMinute)
  const now = new Date(
    nowUTC.toLocaleString("en-US", { timeZone: safeTimezone }),
  )

  switch (condition.triggerType) {
    case "before":
    case "after": {
      if (!(condition.timeValue && condition.timeType)) {
        return false
      }

      const targetDate = calculateTargetDateTime(
        condition.triggerType,
        condition.timeValue,
        condition.timeType,
        datetimeValue,
      )

      const diffInMinutes = (now.getTime() - targetDate.getTime()) / (1000 * 60)

      const toleranceByUnit = {
        minutes: 1,
        hours: 5,
        days: 30,
      }

      const tolerance = toleranceByUnit[condition.timeType] || 1

      return diffInMinutes <= tolerance
    }
    case "atTheDayOf": {
      let at = condition.at || ""

      if (
        condition.at === "" ||
        condition.at === null ||
        condition.at === undefined
      ) {
        at = datetimeValue.getHours().toString()
      }

      const targetHour = Number.parseInt(at, 10)

      const isSameDay =
        now.getFullYear() === datetimeValue.getFullYear() &&
        now.getMonth() === datetimeValue.getMonth() &&
        now.getDate() === datetimeValue.getDate()

      if (!isSameDay) {
        return false
      }

      const currentHour = now.getHours()
      return currentHour === targetHour
    }
    default:
      return false
  }
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

export function parseDateTimeValue(
  value: unknown,
  timezone = "UTC",
): Date | null {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    return value
  }

  if (typeof value === "string") {
    const dateString = value.trim()
    // Guard the stored zone: a corrupt/crafted value degrades to UTC instead of
    // throwing a RangeError that would crash the whole shared sweep tick.
    const safeTimezone = resolveFilterTimezone(timezone)

    if (DATE_ONLY_REGEX.test(dateString)) {
      const dateTimeStr = `${dateString} 00:00:00`
      return new Date(
        new Date(dateTimeStr).toLocaleString("en-US", {
          timeZone: safeTimezone,
        }),
      )
    }

    return new Date(
      new Date(dateString).toLocaleString("en-US", {
        timeZone: safeTimezone,
      }),
    )
  }

  if (typeof value === "number") {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}
