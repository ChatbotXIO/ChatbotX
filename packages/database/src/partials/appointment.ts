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
      scheduleWindowType: z.literal(
        appointmentScheduleWindowTypes.enum.rollingDays,
      ),
      rollingDays: z.number().int().min(1).max(365).default(30),
      minAdvanceDays: z.number().int().min(0).default(0),
    }),
    z.object({
      scheduleWindowType: z.literal(
        appointmentScheduleWindowTypes.enum.dateRange,
      ),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      minAdvanceDays: z.number().int().min(0).default(0),
    }),
    z.object({
      scheduleWindowType: z.literal(
        appointmentScheduleWindowTypes.enum.specificDay,
      ),
      date: z.iso.date(),
      minAdvanceDays: z.number().int().min(0).default(0),
    }),
    z.object({
      scheduleWindowType: z.literal(
        appointmentScheduleWindowTypes.enum.anyFutureDate,
      ),
      minAdvanceDays: z.number().int().min(0).default(0),
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
