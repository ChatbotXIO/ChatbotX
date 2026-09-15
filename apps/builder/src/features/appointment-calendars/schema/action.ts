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
  name: appointmentCalendarNameSchema.describe("Calendar name."),
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

const optionalExternalEventTemplate = (maxLength: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().max(maxLength).nullable(),
  )

const appointmentAvailabilityIntervalRequest = z.object({
  weekday: z
    .number()
    .int()
    .min(0)
    .max(6)
    .describe("Day of week, 0 (Sunday) through 6 (Saturday)."),
  startMinute: z
    .number()
    .int()
    .min(0)
    .max(1425)
    .multipleOf(15)
    .describe("Interval start, in minutes from midnight, on a 15-minute step."),
  endMinute: z
    .number()
    .int()
    .min(15)
    .max(1439)
    .refine((value) => value === 1439 || value % 15 === 0, {
      message: "End time must be a 15-minute step or 23:59",
    })
    .describe(
      "Interval end, in minutes from midnight, on a 15-minute step (or 23:59).",
    ),
})

export const appointmentReminderRequest = z.object({
  flowId: zodBigintAsString().describe(
    "Flow to trigger for this reminder. Get it from `flows.list`.",
  ),
  timingValue: z.coerce
    .number()
    .int()
    .min(1)
    .describe(
      "Number of timing units before the appointment to send the reminder.",
    ),
  timingUnit: appointmentReminderTimingUnits.describe(
    "Unit for timingValue, e.g. minutes/hours/days.",
  ),
})

export const updateAppointmentCalendarRequest = z
  .object({
    name: appointmentCalendarNameSchema.describe("Calendar name."),
    description: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .nullable()
      .describe("Optional internal description of the calendar."),
    active: z.boolean().describe("Whether the calendar accepts new bookings."),
    timezone: z
      .string()
      .trim()
      .min(1)
      .describe("IANA timezone used to interpret availability and reminders."),
    durationMinutes: z.coerce
      .number()
      .int()
      .refine((value) => DURATION_MINUTE_VALUES.includes(value), {
        message: "Invalid duration",
      })
      .describe("Length of each appointment slot, in minutes."),
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
        .nullable()
        .describe(
          "Buffer time added after each appointment, in minutes, or null for none.",
        ),
    ),
    locationType: appointmentLocationTypes.describe(
      "Where the appointment takes place, e.g. in-person or video call.",
    ),
    locationDetail: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .describe("Address or link shown to the invitee for this location type."),
    scheduleWindowConfig: appointmentScheduleWindowConfigSchema.describe(
      "How far ahead bookings are allowed (e.g. a rolling window or fixed date range).",
    ),
    maxAppointmentsPerUser: z.preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce
        .number()
        .int()
        .min(1)
        .nullable()
        .describe(
          "Maximum number of active appointments a single contact may hold, or null for unlimited.",
        ),
    ),
    dailyLimitEnabled: z.boolean().describe("Whether maxPerDay is enforced."),
    maxPerDay: z.preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce
        .number()
        .int()
        .min(1)
        .nullable()
        .describe(
          "Maximum bookings per day when dailyLimitEnabled is true, or null when not set.",
        ),
    ),
    allowGroupMeeting: z
      .boolean()
      .describe("Whether multiple contacts can book the same slot."),
    maxPerSlot: z.preprocess(
      (value) => (value === "" || value == null ? null : value),
      z.coerce
        .number()
        .int()
        .min(1)
        .nullable()
        .describe(
          "Maximum bookings per slot when allowGroupMeeting is true, or null for unlimited.",
        ),
    ),
    confirmationMessage: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .nullable()
      .describe("Message shown to the invitee after booking."),
    confirmationFlowId: optionalFlowIdField.describe(
      "Flow to trigger when an appointment is booked, or null for none.",
    ),
    cancellationFlowId: optionalFlowIdField.describe(
      "Flow to trigger when an appointment is cancelled, or null for none.",
    ),
    externalConnectionId: optionalFlowIdField.describe(
      "External calendar connection (from `appointmentExternalCalendars.list`) to sync bookings to, or null for none.",
    ),
    externalEventTitleTemplate: optionalExternalEventTemplate(1024).describe(
      "Template for the external calendar event's title, or null to use the default.",
    ),
    externalEventDescriptionTemplate: optionalExternalEventTemplate(
      8192,
    ).describe(
      "Template for the external calendar event's description, or null to use the default.",
    ),
    externalEventAttendeesTemplate: optionalExternalEventTemplate(
      8192,
    ).describe(
      "Template for the external calendar event's attendee list, or null to use the default.",
    ),
    availability: z
      .array(appointmentAvailabilityIntervalRequest)
      .max(70)
      .describe("Weekly recurring availability intervals."),
    reminders: z
      .array(appointmentReminderRequest)
      .max(50)
      .describe("Reminder flows to trigger before each appointment."),
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
