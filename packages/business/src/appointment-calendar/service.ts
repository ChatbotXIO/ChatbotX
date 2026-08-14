import {
  and,
  type DatabaseClient,
  db,
  eq,
  gte,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import {
  type AppointmentScheduleWindowConfig,
  appointmentScheduleWindowConfigSchema,
} from "@chatbotx.io/database/partials"
import {
  appointmentCalendarRepository,
  appointmentReminderDispatchRepository,
} from "@chatbotx.io/database/repositories"
import { appointmentModel } from "@chatbotx.io/database/schema"
import type { AppointmentCalendarModel } from "@chatbotx.io/database/types"
import { createId, resolveFilterTimezone } from "@chatbotx.io/utils"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { normalizeError } from "universal-error-normalizer"
import { appointmentExternalCalendarService } from "../appointment-external-calendar"
import { appointmentReminderService } from "../appointment-reminder"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"

const MINUTES_PER_DAY = 1440
const DATE_LABEL_FORMAT = "yyyy-MM-dd"

type AvailabilityIntervalInput = {
  weekday: number
  startMinute: number
  endMinute: number
}

type ReminderInput = {
  flowId: string
  timingValue: number
  timingUnit: "minutes" | "hours" | "days"
}

export type UpdateAppointmentCalendarInput = {
  workspaceId: string
  id: string
  name: string
  description?: string | null
  active: boolean
  timezone: string
  durationMinutes: number
  bufferAfterMinutes?: number | null
  locationType: AppointmentCalendarModel["locationType"]
  locationDetail?: string | null
  scheduleWindowType: AppointmentCalendarModel["scheduleWindowType"]
  scheduleWindowConfig: AppointmentScheduleWindowConfig
  maxAppointmentsPerUser?: number | null
  dailyLimitEnabled: boolean
  maxPerDay?: number | null
  allowGroupMeeting: boolean
  maxPerSlot?: number | null
  confirmationMessage?: string | null
  confirmationFlowId?: string | null
  cancellationFlowId?: string | null
  externalConnectionId?: string | null
  availability: AvailabilityIntervalInput[]
  reminders: ReminderInput[]
}

export type GenerateAvailableSlotsInput = {
  workspaceId: string
  calendarId: string
  startDate: Date
  endDate: Date
  contactId?: string
  externalBusyIntervals?: ExternalBusyInterval[]
  tx?: DatabaseClient
}

export type AvailableSlot = {
  startAt: Date
  endAt: Date
}

export type ExternalBusyInterval = { start: number; end: number }
export type AvailabilityFailurePolicy = "empty" | "throw"
export type AvailabilityFingerprint = {
  externalConnectionId: string | null
  timezone: string
  updatedAt: number
}
export type AvailabilityContext = {
  calendarFingerprint: AvailabilityFingerprint
  externalBusyIntervals: ExternalBusyInterval[]
  listingEmpty: boolean
}

type MergedInterval = { start: number; end: number }
export type ZonedCalendarDay = { date: string; weekday: number }

const LISTING_BUSY_EVENTS_TIMEOUT_MS = 2500
const BOOKING_BUSY_EVENTS_TIMEOUT_MS = 5000

/** Sort + merge overlapping/duplicate intervals; overlap never adds capacity. */
export function mergeIntervals(
  intervals: { start: number; end: number }[],
): MergedInterval[] {
  if (intervals.length === 0) {
    return []
  }
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const merged: MergedInterval[] = [{ ...sorted[0] }]
  for (const current of sorted.slice(1)) {
    const last = merged.at(-1) as MergedInterval
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end)
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

/** Slice a merged interval into fixed-length slots, stepping by duration + buffer. */
export function sliceIntervalIntoSlots(
  interval: MergedInterval,
  durationMinutes: number,
  bufferAfterMinutes: number,
): { startMinute: number; endMinute: number }[] {
  const slots: { startMinute: number; endMinute: number }[] = []
  const step = durationMinutes + bufferAfterMinutes
  for (
    let start = interval.start;
    start + durationMinutes <= interval.end;
    start += step
  ) {
    slots.push({ startMinute: start, endMinute: start + durationMinutes })
  }
  return slots
}

export function overlaps(
  slotStartMs: number,
  slotEndMs: number,
  intervals: ExternalBusyInterval[],
): boolean {
  return intervals.some(
    (interval) => slotEndMs > interval.start && slotStartMs < interval.end,
  )
}

export function buildAvailabilityFingerprint(
  calendar: Pick<
    AppointmentCalendarModel,
    "externalConnectionId" | "timezone" | "updatedAt"
  >,
): AvailabilityFingerprint {
  return {
    externalConnectionId: calendar.externalConnectionId,
    timezone: calendar.timezone,
    updatedAt: calendar.updatedAt.getTime(),
  }
}

export function matchesAvailabilityFingerprint(
  calendar: Pick<
    AppointmentCalendarModel,
    "externalConnectionId" | "timezone" | "updatedAt"
  >,
  fingerprint: AvailabilityFingerprint,
): boolean {
  const current = buildAvailabilityFingerprint(calendar)
  return (
    current.externalConnectionId === fingerprint.externalConnectionId &&
    current.timezone === fingerprint.timezone &&
    current.updatedAt === fingerprint.updatedAt
  )
}

export function resolveWindowBounds(
  config: AppointmentScheduleWindowConfig,
  timezone: string,
  requestedStart: Date,
  requestedEnd: Date,
): { start: Date; end: Date } | null {
  const resolvedTimezone = resolveFilterTimezone(timezone)
  const now = new Date()
  const minAdvanceDays = config.minAdvanceDays
  const minAdvanceMs = minAdvanceDays * MINUTES_PER_DAY * 60 * 1000
  const earliestAllowed = new Date(now.getTime() + minAdvanceMs)
  const clampStart = new Date(
    Math.max(requestedStart.getTime(), earliestAllowed.getTime()),
  )

  if (config.scheduleWindowType === "rollingDays") {
    const windowEnd = new Date(
      now.getTime() + config.rollingDays * MINUTES_PER_DAY * 60 * 1000,
    )
    const end = new Date(Math.min(requestedEnd.getTime(), windowEnd.getTime()))
    return clampStart <= end ? { start: clampStart, end } : null
  }

  if (config.scheduleWindowType === "dateRange") {
    const rangeStart = fromZonedTime(
      `${config.startDate}T00:00:00.000`,
      resolvedTimezone,
    )
    const rangeEnd = fromZonedTime(
      `${config.endDate}T23:59:59.999`,
      resolvedTimezone,
    )
    const start = new Date(Math.max(clampStart.getTime(), rangeStart.getTime()))
    const end = new Date(Math.min(requestedEnd.getTime(), rangeEnd.getTime()))
    return start <= end ? { start, end } : null
  }

  if (config.scheduleWindowType === "specificDay") {
    const dayStart = fromZonedTime(
      `${config.date}T00:00:00.000`,
      resolvedTimezone,
    )
    const dayEnd = fromZonedTime(
      `${config.date}T23:59:59.999`,
      resolvedTimezone,
    )
    const start = new Date(Math.max(clampStart.getTime(), dayStart.getTime()))
    const end = new Date(Math.min(requestedEnd.getTime(), dayEnd.getTime()))
    return start <= end ? { start, end } : null
  }

  return clampStart <= requestedEnd
    ? { start: clampStart, end: requestedEnd }
    : null
}

function minutesToHHMMSS(totalMinutes: number): string {
  const clamped = Math.min(Math.max(totalMinutes, 0), MINUTES_PER_DAY - 1)
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`
}

function dateLabelToUtcDate(label: string): Date {
  const [year, month, day] = label.split("-").map(Number)
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1))
}

export function listZonedCalendarDays(
  start: Date,
  end: Date,
  timezone: string,
): ZonedCalendarDay[] {
  const resolvedTimezone = resolveFilterTimezone(timezone)
  const startLabel = formatInTimeZone(
    start,
    resolvedTimezone,
    DATE_LABEL_FORMAT,
  )
  const endLabel = formatInTimeZone(end, resolvedTimezone, DATE_LABEL_FORMAT)
  const cursor = dateLabelToUtcDate(startLabel)
  const endCursor = dateLabelToUtcDate(endLabel)
  const days: ZonedCalendarDay[] = []

  while (cursor <= endCursor) {
    const date = cursor.toISOString().slice(0, 10)
    const localNoon = fromZonedTime(`${date}T12:00:00.000`, resolvedTimezone)
    const isoWeekday = Number(
      formatInTimeZone(localNoon, resolvedTimezone, "i"),
    )
    days.push({ date, weekday: isoWeekday % 7 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
}

export class AppointmentCalendarService extends BaseService {
  async findBy(
    input: { workspaceId: string; id: string; includeDeleted?: boolean },
    tx?: DatabaseClient,
  ) {
    return await appointmentCalendarRepository.findBy(input, tx)
  }

  async findByOrFail(
    input: { workspaceId: string; id: string; includeDeleted?: boolean },
    tx?: DatabaseClient,
  ) {
    const calendar = await this.findBy(input, tx)
    if (!calendar) {
      throw notFoundException("Appointment calendar not found")
    }
    return calendar
  }

  async findByPublicLinkSlug(
    input: { workspaceId: string; publicLinkSlug: string },
    tx?: DatabaseClient,
  ) {
    return await appointmentCalendarRepository.findByPublicLinkSlug(input, tx)
  }

  async getForEdit(
    input: { workspaceId: string; id: string },
    tx?: DatabaseClient,
  ) {
    const calendar = await appointmentCalendarRepository.getForEdit(input, tx)
    if (!calendar) {
      throw notFoundException("Appointment calendar not found")
    }
    return calendar
  }

  async list(
    input: Parameters<typeof appointmentCalendarRepository.list>[0],
    tx?: DatabaseClient,
  ) {
    return await appointmentCalendarRepository.list(input, tx)
  }

  async listForFlow(
    input: { workspaceId: string; keyword?: string },
    tx?: DatabaseClient,
  ) {
    return await appointmentCalendarRepository.listForFlow(input, tx)
  }

  async create(input: { workspaceId: string; name: string }) {
    try {
      const row = await appointmentCalendarRepository.create({
        workspaceId: input.workspaceId,
        name: input.name.trim(),
        timezone: "UTC",
        locationType: "onlineMeeting",
        publicLinkSlug: createId().toString(),
      })
      return row.id
    } catch (error) {
      this.throwMappedUniqueError(error)
      throw error
    }
  }

  async setActive(input: { workspaceId: string; id: string; active: boolean }) {
    const row = await appointmentCalendarRepository.update({
      workspaceId: input.workspaceId,
      id: input.id,
      active: input.active,
    })
    if (!row) {
      throw notFoundException("Appointment calendar not found")
    }
  }

  async rename(input: { workspaceId: string; id: string; name: string }) {
    try {
      const row = await appointmentCalendarRepository.update({
        workspaceId: input.workspaceId,
        id: input.id,
        name: input.name.trim(),
      })
      if (!row) {
        throw notFoundException("Appointment calendar not found")
      }
    } catch (error) {
      this.throwMappedUniqueError(error)
      throw error
    }
  }

  async duplicate(input: { workspaceId: string; id: string }) {
    try {
      return await db.transaction(async (tx) => {
        const source = await this.getForEdit(input, tx)
        const created = await appointmentCalendarRepository.create(
          {
            workspaceId: input.workspaceId,
            name: `${source.name} - Copy`,
            timezone: source.timezone,
            locationType: source.locationType,
            publicLinkSlug: createId().toString(),
          },
          tx,
        )

        await appointmentCalendarRepository.update(
          {
            workspaceId: input.workspaceId,
            id: created.id,
            description: source.description,
            durationMinutes: source.durationMinutes,
            bufferAfterMinutes: source.bufferAfterMinutes,
            locationDetail: source.locationDetail,
            scheduleWindowType: source.scheduleWindowType,
            scheduleWindowConfig: source.scheduleWindowConfig as Record<
              string,
              unknown
            >,
            maxAppointmentsPerUser: source.maxAppointmentsPerUser,
            dailyLimitEnabled: source.dailyLimitEnabled,
            maxPerDay: source.maxPerDay,
            allowGroupMeeting: source.allowGroupMeeting,
            maxPerSlot: source.maxPerSlot,
            confirmationMessage: source.confirmationMessage,
            confirmationFlowId: source.confirmationFlowId,
            cancellationFlowId: source.cancellationFlowId,
            externalConnectionId: source.externalConnectionId,
            active: false,
          },
          tx,
        )
        await appointmentCalendarRepository.replaceAvailability(
          {
            calendarId: created.id,
            availability: source.availability.map((row) => ({
              weekday: row.weekday,
              startMinute: row.startMinute,
              endMinute: row.endMinute,
            })),
          },
          tx,
        )
        await appointmentCalendarRepository.replaceReminders(
          {
            calendarId: created.id,
            reminders: source.reminders.map((row) => ({
              flowId: row.flowId,
              timingValue: row.timingValue,
              timingUnit: row.timingUnit,
            })),
          },
          tx,
        )
        return created.id
      })
    } catch (error) {
      this.throwMappedUniqueError(error)
      throw error
    }
  }

  async deleteMany(input: { workspaceId: string; ids: string[] }) {
    if (input.ids.length === 0) {
      return
    }
    await appointmentCalendarRepository.softDeleteMany(input)
  }

  async update(input: UpdateAppointmentCalendarInput) {
    let staleReminderJobIds: string[] = []
    try {
      await db.transaction(async (tx) => {
        await this.findByOrFail(input, tx)
        if (input.externalConnectionId) {
          await appointmentExternalCalendarService.getGoogleConnectionForProviderCall(
            {
              workspaceId: input.workspaceId,
              integrationId: input.externalConnectionId,
            },
            tx,
          )
        }
        const row = await appointmentCalendarRepository.update(
          {
            workspaceId: input.workspaceId,
            id: input.id,
            name: input.name.trim(),
            description: input.description,
            active: input.active,
            timezone: input.timezone,
            durationMinutes: input.durationMinutes,
            bufferAfterMinutes: input.bufferAfterMinutes,
            locationType: input.locationType,
            locationDetail: input.locationDetail,
            scheduleWindowType: input.scheduleWindowType,
            scheduleWindowConfig: input.scheduleWindowConfig,
            maxAppointmentsPerUser: input.maxAppointmentsPerUser,
            dailyLimitEnabled: input.dailyLimitEnabled,
            maxPerDay: input.maxPerDay,
            allowGroupMeeting: input.allowGroupMeeting,
            maxPerSlot: input.maxPerSlot,
            confirmationMessage: input.confirmationMessage,
            confirmationFlowId: input.confirmationFlowId,
            cancellationFlowId: input.cancellationFlowId,
            externalConnectionId: input.externalConnectionId,
          },
          tx,
        )
        if (!row) {
          throw notFoundException("Appointment calendar not found")
        }
        await appointmentCalendarRepository.replaceAvailability(
          {
            calendarId: input.id,
            availability: input.availability,
          },
          tx,
        )
        staleReminderJobIds =
          await appointmentReminderDispatchRepository.listPendingJobIdsForFutureCalendar(
            {
              workspaceId: input.workspaceId,
              calendarId: input.id,
            },
            tx,
          )
        try {
          await appointmentCalendarRepository.replaceReminders(
            {
              calendarId: input.id,
              reminders: input.reminders,
            },
            tx,
          )
        } catch (error) {
          if (isUniqueViolationError(error)) {
            throw new ChatbotXException(
              "Duplicate reminder: same flow and timing already exists",
              "duplicateReminder",
              409,
            )
          }
          throw error
        }
      })
    } catch (error) {
      this.throwMappedUniqueError(error)
      throw error
    }

    try {
      await appointmentReminderService.rescheduleFutureForCalendar({
        workspaceId: input.workspaceId,
        calendarId: input.id,
        staleJobIds: staleReminderJobIds,
      })
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: input.workspaceId,
          calendarId: input.id,
        },
        "Failed to reschedule future appointment reminders after calendar update",
      )
    }
  }

  /**
   * Single source of truth for slot generation, reused by the Phase 3 flow
   * step and Phase 4 booking picker — do not duplicate this logic elsewhere.
   */
  async prepareAvailabilityContext(input: {
    workspaceId: string
    calendarId: string
    startDate: Date
    endDate: Date
    failurePolicy: AvailabilityFailurePolicy
  }): Promise<AvailabilityContext> {
    const calendar = await this.findByOrFail({
      workspaceId: input.workspaceId,
      id: input.calendarId,
    })
    const calendarFingerprint = buildAvailabilityFingerprint(calendar)
    if (!calendar.active) {
      return {
        calendarFingerprint,
        externalBusyIntervals: [],
        listingEmpty: true,
      }
    }

    const windowConfig = appointmentScheduleWindowConfigSchema.parse({
      scheduleWindowType: calendar.scheduleWindowType,
      ...((calendar.scheduleWindowConfig as Record<string, unknown>) ?? {}),
    })
    const calendarTimezone = resolveFilterTimezone(calendar.timezone)
    const bounds = resolveWindowBounds(
      windowConfig,
      calendarTimezone,
      input.startDate,
      input.endDate,
    )
    if (!bounds) {
      return {
        calendarFingerprint,
        externalBusyIntervals: [],
        listingEmpty: true,
      }
    }
    if (!calendar.externalConnectionId) {
      return {
        calendarFingerprint,
        externalBusyIntervals: [],
        listingEmpty: false,
      }
    }

    try {
      const externalBusyIntervals =
        await appointmentExternalCalendarService.getBusyIntervalsForAppointmentCalendar(
          {
            workspaceId: input.workspaceId,
            integrationId: calendar.externalConnectionId,
            timeMin: bounds.start.toISOString(),
            timeMax: bounds.end.toISOString(),
            timeZone: calendarTimezone,
            timeoutMs:
              input.failurePolicy === "empty"
                ? LISTING_BUSY_EVENTS_TIMEOUT_MS
                : BOOKING_BUSY_EVENTS_TIMEOUT_MS,
          },
        )
      return {
        calendarFingerprint,
        externalBusyIntervals,
        listingEmpty: false,
      }
    } catch (error) {
      if (input.failurePolicy === "throw") {
        throw error
      }
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: input.workspaceId,
          calendarId: input.calendarId,
          integrationId: calendar.externalConnectionId,
          reason: "externalBusyEventsFailed",
        },
        "Failed to fetch appointment external busy events",
      )
      return {
        calendarFingerprint,
        externalBusyIntervals: [],
        listingEmpty: true,
      }
    }
  }

  async resolveAvailableSlotsForListing(
    input: Omit<GenerateAvailableSlotsInput, "externalBusyIntervals" | "tx">,
  ): Promise<AvailableSlot[]> {
    const context = await this.prepareAvailabilityContext({
      workspaceId: input.workspaceId,
      calendarId: input.calendarId,
      startDate: input.startDate,
      endDate: input.endDate,
      failurePolicy: "empty",
    })
    if (context.listingEmpty) {
      return []
    }

    return await this.generateAvailableSlots({
      ...input,
      externalBusyIntervals: context.externalBusyIntervals,
    })
  }

  async hasExternalBusyConflictForSlot(input: {
    workspaceId: string
    calendarId: string
    externalConnectionId?: string | null
    startAt: Date
    endAt: Date
  }): Promise<boolean> {
    if (!input.externalConnectionId) {
      return false
    }

    try {
      const busyIntervals =
        await appointmentExternalCalendarService.getBusyIntervalsForAppointmentCalendar(
          {
            workspaceId: input.workspaceId,
            integrationId: input.externalConnectionId,
            timeMin: input.startAt.toISOString(),
            timeMax: input.endAt.toISOString(),
            timeoutMs: BOOKING_BUSY_EVENTS_TIMEOUT_MS,
          },
        )
      return overlaps(
        input.startAt.getTime(),
        input.endAt.getTime(),
        busyIntervals,
      )
    } catch (error) {
      logger.warn(
        {
          err: normalizeError(error),
          workspaceId: input.workspaceId,
          calendarId: input.calendarId,
          integrationId: input.externalConnectionId,
          reason: "externalSlotRevalidationFailed",
        },
        "External calendar re-check failed, failing closed",
      )
      return true
    }
  }

  async generateAvailableSlots(
    input: GenerateAvailableSlotsInput,
  ): Promise<AvailableSlot[]> {
    const tx = input.tx ?? db
    const calendar = await this.findBy(
      {
        workspaceId: input.workspaceId,
        id: input.calendarId,
      },
      tx,
    )
    if (!calendar?.active) {
      return []
    }

    const windowConfig = appointmentScheduleWindowConfigSchema.parse({
      scheduleWindowType: calendar.scheduleWindowType,
      ...((calendar.scheduleWindowConfig as Record<string, unknown>) ?? {}),
    })
    const calendarTimezone = resolveFilterTimezone(calendar.timezone)
    const bounds = resolveWindowBounds(
      windowConfig,
      calendarTimezone,
      input.startDate,
      input.endDate,
    )
    if (!bounds) {
      return []
    }

    if (calendar.maxAppointmentsPerUser != null && input.contactId) {
      const futureCount = await tx.$count(
        appointmentModel,
        and(
          eq(appointmentModel.workspaceId, input.workspaceId),
          eq(appointmentModel.calendarId, input.calendarId),
          eq(appointmentModel.contactId, input.contactId),
          eq(appointmentModel.status, "scheduled"),
          gte(appointmentModel.startAt, new Date()),
        ),
      )
      if (futureCount >= calendar.maxAppointmentsPerUser) {
        return []
      }
    }

    const availability =
      await tx.query.appointmentCalendarAvailabilityModel.findMany({
        where: { calendarId: input.calendarId },
      })
    const byWeekday = new Map<number, MergedInterval[]>()
    for (const row of availability) {
      const existing = byWeekday.get(row.weekday) ?? []
      existing.push({ start: row.startMinute, end: row.endMinute })
      byWeekday.set(row.weekday, existing)
    }
    for (const [weekday, intervals] of byWeekday) {
      byWeekday.set(weekday, mergeIntervals(intervals))
    }

    const durationMinutes = calendar.durationMinutes
    const bufferMinutes = calendar.bufferAfterMinutes ?? 0
    const capacity = calendar.allowGroupMeeting
      ? (calendar.maxPerSlot ?? Number.POSITIVE_INFINITY)
      : 1

    const existingAppointments = await tx.query.appointmentModel.findMany({
      where: {
        calendarId: input.calendarId,
        status: "scheduled",
        startAt: { gte: bounds.start, lte: bounds.end },
      },
      columns: { startAt: true },
    })
    const countByStartAt = new Map<number, number>()
    for (const appointment of existingAppointments) {
      const key = appointment.startAt.getTime()
      countByStartAt.set(key, (countByStartAt.get(key) ?? 0) + 1)
    }

    const slots: AvailableSlot[] = []
    const calendarDays = listZonedCalendarDays(
      bounds.start,
      bounds.end,
      calendarTimezone,
    )

    for (const day of calendarDays) {
      const dayLabel = day.date
      const intervals = byWeekday.get(day.weekday) ?? []

      if (calendar.dailyLimitEnabled && calendar.maxPerDay != null) {
        const dayStart = fromZonedTime(
          `${dayLabel}T00:00:00.000`,
          calendarTimezone,
        )
        const dayEnd = fromZonedTime(
          `${dayLabel}T23:59:59.999`,
          calendarTimezone,
        )
        let dayCount = 0
        for (const [startAtMs, appointmentCount] of countByStartAt) {
          if (
            startAtMs >= dayStart.getTime() &&
            startAtMs <= dayEnd.getTime()
          ) {
            dayCount += appointmentCount
          }
        }
        if (dayCount >= calendar.maxPerDay) {
          continue
        }
      }

      for (const interval of intervals) {
        const daySlots = sliceIntervalIntoSlots(
          interval,
          durationMinutes,
          bufferMinutes,
        )
        for (const slot of daySlots) {
          const startAt = fromZonedTime(
            `${dayLabel}T${minutesToHHMMSS(slot.startMinute)}`,
            calendarTimezone,
          )
          if (startAt < bounds.start || startAt > bounds.end) {
            continue
          }
          const alreadyBooked = countByStartAt.get(startAt.getTime()) ?? 0
          if (alreadyBooked >= capacity) {
            continue
          }
          const endAt = new Date(
            startAt.getTime() + durationMinutes * 60 * 1000,
          )
          if (
            input.externalBusyIntervals &&
            overlaps(
              startAt.getTime(),
              endAt.getTime(),
              input.externalBusyIntervals,
            )
          ) {
            continue
          }
          slots.push({ startAt, endAt })
        }
      }
    }

    return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  }

  private throwMappedUniqueError(error: unknown): never | undefined {
    if (isUniqueViolationError(error)) {
      throw new ChatbotXException(
        "Calendar name already exists",
        "nameAlreadyExists",
        409,
      )
    }
  }
}

export const appointmentCalendarService = new AppointmentCalendarService()
