import { isValidTimezone } from "@chatbotx.io/utils/timezone"
import { validationException } from "../errors"
import type { SchedulePlan } from "./types"

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** A scheduled time must be at least this far ahead. */
export const SCHEDULE_MIN_LEAD_MS = 2 * MINUTE_MS
/** ...and at most this far (one year). */
export const SCHEDULE_MAX_LEAD_MS = 365 * DAY_MS
/** A target due within this long is about to be picked up: it can no longer be moved. */
export const RESCHEDULE_LOCK_MS = 1 * MINUTE_MS
/** A target that is late by up to this long publishes late; later than that it is given up. */
export const MISSED_SCHEDULE_WINDOW_MS = 6 * HOUR_MS
/** The earliest due time that still publishes at `now`; a target due before it is missed. */
export const lateCutoffAt = (now: Date): Date =>
  new Date(now.getTime() - MISSED_SCHEDULE_WINDOW_MS)
export const MISSED_SCHEDULE_CODE = "missedSchedule"
export const MISSED_SCHEDULE_MESSAGE =
  "The scheduled time passed while publishing was not running, and it is too late to publish now"

export const SOCIAL_POST_NOT_SCHEDULABLE_CODE = "socialPostNotSchedulable"
export const SOCIAL_POST_TARGET_NOT_RESCHEDULABLE_CODE =
  "socialPostTargetNotReschedulable"

/** The earliest instant a schedule operation may pick. */
export const earliestSchedule = (now: Date): Date =>
  new Date(now.getTime() + SCHEDULE_MIN_LEAD_MS)

/** Refuses a time that is too soon or too far; `field` names the request field. */
export const assertScheduleWindow = (
  at: Date,
  now: Date,
  field = "scheduledAt",
): void => {
  if (Number.isNaN(at.getTime())) {
    throw validationException(field, "The time is not a valid date")
  }
  if (at.getTime() < now.getTime() + SCHEDULE_MIN_LEAD_MS) {
    throw validationException(
      field,
      "The time must be at least 2 minutes from now",
    )
  }
  if (at.getTime() > now.getTime() + SCHEDULE_MAX_LEAD_MS) {
    throw validationException(
      field,
      "The time must be within one year from now",
    )
  }
}

export const assertTimezone = (timezone: string, field = "timezone"): void => {
  if (!isValidTimezone(timezone)) {
    throw validationException(
      field,
      "Use an IANA time zone name, e.g. Asia/Ho_Chi_Minh",
    )
  }
}

/**
 * Checks a plan before anything is saved: exactly one way to pick the time, a
 * valid zone, and every time inside the window. Pure, so a create can refuse a
 * bad schedule without leaving a draft behind.
 */
export const assertSchedulePlan = (plan: SchedulePlan, now: Date): void => {
  if (plan.scheduledAt && plan.queue) {
    throw validationException(
      "queue",
      "Give either scheduledAt or queue, not both",
    )
  }
  if (!(plan.scheduledAt || plan.queue || plan.targetTimes)) {
    throw validationException("scheduledAt", "Give scheduledAt or queue")
  }
  if (plan.timezone) {
    assertTimezone(plan.timezone)
  }
  if (plan.scheduledAt) {
    assertScheduleWindow(plan.scheduledAt, now)
  }
  for (const at of Object.values(plan.targetTimes ?? {})) {
    assertScheduleWindow(at, now, "targets")
  }
}
