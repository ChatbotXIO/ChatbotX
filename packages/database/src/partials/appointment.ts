import { z } from "zod"

export const appointmentLocationTypes = z.enum([
  "inPerson",
  "phoneCall",
  "onlineMeeting",
])
export type AppointmentLocationType = z.infer<typeof appointmentLocationTypes>

export const appointmentScheduleWindowTypes = z.enum([
  "rollingDays",
  "dateRange",
  "specificDay",
  "anyFutureDate",
])
export type AppointmentScheduleWindowType = z.infer<
  typeof appointmentScheduleWindowTypes
>

export const appointmentDurationMinutes = z.enum([
  "5",
  "10",
  "15",
  "20",
  "25",
  "30",
  "45",
  "60",
])
export type AppointmentDurationMinutes = z.infer<
  typeof appointmentDurationMinutes
>

export const appointmentBufferMinutes = z.enum([
  "5",
  "10",
  "15",
  "30",
  "45",
  "60",
])
export type AppointmentBufferMinutes = z.infer<typeof appointmentBufferMinutes>

export const appointmentReminderTimingUnits = z.enum([
  "minutes",
  "hours",
  "days",
])
export type AppointmentReminderTimingUnit = z.infer<
  typeof appointmentReminderTimingUnits
>

export const appointmentStatuses = z.enum(["scheduled", "cancelled"])
export type AppointmentStatus = z.infer<typeof appointmentStatuses>

export const appointmentExternalSyncStatuses = z.enum([
  "pending",
  "synced",
  "failed",
])
export type AppointmentExternalSyncStatus = z.infer<
  typeof appointmentExternalSyncStatuses
>

export const appointmentExternalSyncOperations = z.enum(["create", "cancel"])
export type AppointmentExternalSyncOperation = z.infer<
  typeof appointmentExternalSyncOperations
>

export const appointmentReminderDispatchStatuses = z.enum([
  "pending",
  "sent",
  "cancelled",
  "failed",
])
export type AppointmentReminderDispatchStatus = z.infer<
  typeof appointmentReminderDispatchStatuses
>

export const appointmentExternalProviderTypes = z.enum([
  "googleCalendar",
  "outlookCalendar",
])
export type AppointmentExternalProviderType = z.infer<
  typeof appointmentExternalProviderTypes
>

export const defaultAppointmentExternalEventTitleTemplate =
  "Appointment: {{booking_calendar}}"
export const defaultAppointmentExternalEventAttendeesTemplate = "{{email}}"

/**
 * `scheduleWindowConfig` is stored as free-form jsonb (no DB-level shape
 * constraint); this schema is the single source of truth for validating it
 * at the service boundary and for the builder edit form. `minAdvanceDays` has
 * no dedicated column (PLAN Risk note) and is folded in here per calendar
 * instead of a new migration.
 */
export const appointmentScheduleWindowConfigSchema = z
  .discriminatedUnion("scheduleWindowType", [
    z.object({
      scheduleWindowType: z
        .literal(appointmentScheduleWindowTypes.enum.rollingDays)
        .describe("Bookable from now through the next `rollingDays` days."),
      rollingDays: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe(
          "Bookable window length in days counted from now, 1-365 (default 30).",
        ),
      minAdvanceDays: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe(
          "Minimum notice in days: slots earlier than now + this many days are not bookable. 0 = no minimum.",
        ),
    }),
    z.object({
      scheduleWindowType: z
        .literal(appointmentScheduleWindowTypes.enum.dateRange)
        .describe("Bookable between `startDate` and `endDate`."),
      startDate: z.iso
        .date()
        .describe(
          "First bookable date, YYYY-MM-DD, in the calendar's timezone.",
        ),
      endDate: z.iso
        .date()
        .describe(
          "Last bookable date (inclusive), YYYY-MM-DD; must be on or after startDate.",
        ),
      minAdvanceDays: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe(
          "Minimum notice in days: slots earlier than now + this many days are not bookable. 0 = no minimum.",
        ),
    }),
    z.object({
      scheduleWindowType: z
        .literal(appointmentScheduleWindowTypes.enum.specificDay)
        .describe("Bookable on a single `date`."),
      date: z.iso
        .date()
        .describe(
          "The only bookable date, YYYY-MM-DD, in the calendar's timezone.",
        ),
      minAdvanceDays: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe(
          "Minimum notice in days: slots earlier than now + this many days are not bookable. 0 = no minimum.",
        ),
    }),
    z.object({
      scheduleWindowType: z
        .literal(appointmentScheduleWindowTypes.enum.anyFutureDate)
        .describe("Any future date is bookable (no end limit)."),
      minAdvanceDays: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe(
          "Minimum notice in days: slots earlier than now + this many days are not bookable. 0 = no minimum.",
        ),
    }),
  ])
  .refine(
    (config) =>
      config.scheduleWindowType !== "dateRange" ||
      config.endDate >= config.startDate,
    { message: "endDate must be on or after startDate", path: ["endDate"] },
  )
export type AppointmentScheduleWindowConfig = z.infer<
  typeof appointmentScheduleWindowConfigSchema
>
