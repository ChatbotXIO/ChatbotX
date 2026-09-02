import {
  appointmentBufferMinutes,
  appointmentDurationMinutes,
  appointmentLocationTypes,
  appointmentReminderTimingUnits,
  appointmentScheduleWindowConfigSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const appointmentCalendarNameSchema = z.string().trim().min(1).max(255)

export const createAppointmentCalendarRequest = z.object({
  name: appointmentCalendarNameSchema,
})
export type CreateAppointmentCalendarRequest = z.infer<
  typeof createAppointmentCalendarRequest
>

export const renameAppointmentCalendarRequest = createAppointmentCalendarRequest
export type RenameAppointmentCalendarRequest = z.infer<
  typeof renameAppointmentCalendarRequest
>

export const updateAppointmentCalendarActiveRequest = z.object({
  active: z.boolean(),
})
export type UpdateAppointmentCalendarActiveRequest = z.infer<
  typeof updateAppointmentCalendarActiveRequest
>

export const noAppointmentCalendarSelectionValue = "__none__"

const DURATION_MINUTE_VALUES = appointmentDurationMinutes.options.map(Number)
const BUFFER_MINUTE_VALUES = appointmentBufferMinutes.options.map(Number)

const optionalFlowIdField = z.preprocess(
  (value) => (value === noAppointmentCalendarSelectionValue ? null : value),
  zodBigintAsString().optional().nullable(),
)

const appointmentAvailabilityIntervalRequest = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1425).multipleOf(15),
  endMinute: z
    .number()
    .int()
    .min(15)
    .max(1439)
    .refine((value) => value === 1439 || value % 15 === 0, {
      message: "End time must be a 15-minute step or 23:59",
    }),
})

export const appointmentReminderRequest = z.object({
  flowId: zodBigintAsString(),
  timingValue: z.coerce.number().int().min(1),
  timingUnit: appointmentReminderTimingUnits,
})

export const updateAppointmentCalendarRequest = z
  .object({
    name: appointmentCalendarNameSchema,
    description: z.string().trim().max(2000).optional().nullable(),
    active: z.boolean(),
    timezone: z.string().trim().min(1),
    durationMinutes: z.coerce
      .number()
      .int()
      .refine((value) => DURATION_MINUTE_VALUES.includes(value), {
        message: "Invalid duration",
      }),
    bufferAfterMinutes: z.preprocess(
      (value) =>
        value === noAppointmentCalendarSelectionValue || value === ""
          ? null
          : value,
      z.coerce
        .number()
        .int()
        .refine((value) => BUFFER_MINUTE_VALUES.includes(value), {
          message: "Invalid buffer",
        })
        .nullable(),
    ),
    locationType: appointmentLocationTypes,
    locationDetail: z.string().trim().max(500).optional().nullable(),
    scheduleWindowConfig: appointmentScheduleWindowConfigSchema,
    maxAppointmentsPerUser: z.preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce.number().int().min(1).nullable(),
    ),
    dailyLimitEnabled: z.boolean(),
    maxPerDay: z.preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce.number().int().min(1).nullable(),
    ),
    allowGroupMeeting: z.boolean(),
    maxPerSlot: z.preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce.number().int().min(1).nullable(),
    ),
    confirmationMessage: z.string().trim().max(2000).optional().nullable(),
    confirmationFlowId: optionalFlowIdField,
    cancellationFlowId: optionalFlowIdField,
    externalConnectionId: optionalFlowIdField,
    availability: z.array(appointmentAvailabilityIntervalRequest).max(70),
    reminders: z.array(appointmentReminderRequest).max(50),
  })
  .superRefine((data, ctx) => {
    if (data.dailyLimitEnabled && data.maxPerDay == null) {
      ctx.addIssue({
        code: "custom",
        path: ["maxPerDay"],
        message: "Max per day is required when daily limit is enabled",
      })
    }
    if (data.allowGroupMeeting && data.maxPerSlot == null) {
      ctx.addIssue({
        code: "custom",
        path: ["maxPerSlot"],
        message: "Max per slot is required when group meeting is allowed",
      })
    }

    const intervalsByWeekday = new Map<number, number>()
    data.availability.forEach((interval, index) => {
      if (interval.endMinute <= interval.startMinute) {
        ctx.addIssue({
          code: "custom",
          path: ["availability", index, "endMinute"],
          message: "End time must be after start time",
        })
      }
      intervalsByWeekday.set(
        interval.weekday,
        (intervalsByWeekday.get(interval.weekday) ?? 0) + 1,
      )
    })
    for (const [weekday, total] of intervalsByWeekday) {
      if (total > 10) {
        const firstIndexForWeekday = data.availability.findIndex(
          (interval) => interval.weekday === weekday,
        )
        ctx.addIssue({
          code: "custom",
          path: ["availability", firstIndexForWeekday],
          message: "A maximum of 10 intervals per day is allowed",
        })
      }
    }

    const reminderKeys = new Set<string>()
    data.reminders.forEach((reminder, index) => {
      const key = `${reminder.flowId}:${reminder.timingValue}:${reminder.timingUnit}`
      if (reminderKeys.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["reminders", index],
          message: "Duplicate reminder: same flow and timing already exists",
        })
      }
      reminderKeys.add(key)
    })
  })
export type UpdateAppointmentCalendarRequest = z.infer<
  typeof updateAppointmentCalendarRequest
>
