import { db } from "@chatbotx.io/database/client"
import type {
  AppointmentLocationType,
  AppointmentReminderTimingUnit,
  AppointmentScheduleWindowType,
} from "@chatbotx.io/database/partials"
import { appointmentCalendarRepository } from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import { insertCopyNamed } from "./naming"
import {
  createFlowRefPatcher,
  dependenciesOn,
  makeCollector,
  recordCopy,
  scopedWhere,
  updateNotSupported,
} from "./shared"
import type {
  PatchTask,
  ResourceAdapter,
  TemplateInstallContext,
} from "./types"

type TemplateCalendarAvailability = {
  weekday: number
  startMinute: number
  endMinute: number
}

type TemplateCalendarReminder = {
  // Points at a `resources.flows` sourceId — flows insert *after* calendars
  // in Phase 1, so this is always deferred to Phase 2. NOT NULL on the row
  // (invariant: `AppointmentCalendarReminder.flowId` can't dangle) — a
  // reminder whose flow never resolves is skipped, not written with a
  // placeholder.
  flowId: string
  timingValue: number
  timingUnit: AppointmentReminderTimingUnit
}

type TemplateCalendarEntry = {
  sourceId: string
  name: string
  description: string | null
  timezone: string
  locationType: AppointmentLocationType
  locationDetail: string | null
  durationMinutes: number
  bufferAfterMinutes: number | null
  scheduleWindowType: AppointmentScheduleWindowType
  scheduleWindowConfig: Record<string, unknown>
  maxAppointmentsPerUser: number | null
  dailyLimitEnabled: boolean
  maxPerDay: number | null
  allowGroupMeeting: boolean
  maxPerSlot: number | null
  confirmationMessage: string | null
  // Both point at `resources.flows` sourceIds — nullable columns, so unlike
  // reminders these are simply left `null` if the flow never resolves.
  confirmationFlowId: string | null
  cancellationFlowId: string | null
  // Source-workspace external calendar connection — never carried over
  // (same treatment as AI agent `openaiCompatible.integrationId`): dropped
  // and warned about, never written.
  externalConnectionId?: string | null
  availability: TemplateCalendarAvailability[]
  reminders: TemplateCalendarReminder[]
}

/**
 * Calendars insert with a freshly minted `publicLinkSlug` (globally unique —
 * never carry the source slug over) and `active: false`, mirroring
 * `appointmentCalendarService.duplicate`. `externalConnectionId` is dropped.
 * `confirmationFlowId`/`cancellationFlowId`/reminders all point at flows,
 * which insert later in Phase 1 — deferred to the returned `PatchTask`.
 */
export const calendarsAdapter: ResourceAdapter<TemplateCalendarEntry> = {
  category: "calendars",
  providesKinds: ["calendar"],
  consumesKinds: ["flow"],
  deferredKinds: ["flow"],
  trackedKind: "calendar",
  folderTypes: [],
  minFormatVersion: 1,
  sync: updateNotSupported("calendars"),

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly TemplateCalendarEntry[],
  ): Promise<PatchTask[]> {
    const flowRefs = createFlowRefPatcher("calendars")

    for (const entry of entries) {
      if (entry.externalConnectionId) {
        ctx.warn({
          category: "calendars",
          entityKind: "integration",
          path: `calendars.${entry.sourceId}.externalConnectionId`,
          value: entry.externalConnectionId,
        })
      }

      // A calendar is copied, never reused: a name the target already uses
      // gets the shared copy name instead of failing the whole install.
      const created = await insertCopyNamed(ctx, {
        category: "calendars",
        constraint: "AppointmentCalendar_workspaceId_name_key",
        entry,
        findTaken: (tx, name) =>
          tx.query.appointmentCalendarModel.findMany({
            where: {
              workspaceId: ctx.workspaceId,
              name,
              deletedAt: { isNull: true },
            },
            columns: { name: true },
          }),
        insert: (tx, name) =>
          appointmentCalendarRepository.create(
            {
              workspaceId: ctx.workspaceId,
              name,
              timezone: entry.timezone,
              locationType: entry.locationType,
              publicLinkSlug: createId().toString(),
            },
            tx,
          ),
      })
      if (!created) {
        continue
      }
      await appointmentCalendarRepository.update(
        {
          workspaceId: ctx.workspaceId,
          id: created.id,
          description: entry.description,
          durationMinutes: entry.durationMinutes,
          bufferAfterMinutes: entry.bufferAfterMinutes,
          locationDetail: entry.locationDetail,
          scheduleWindowType: entry.scheduleWindowType,
          scheduleWindowConfig: entry.scheduleWindowConfig,
          maxAppointmentsPerUser: entry.maxAppointmentsPerUser,
          dailyLimitEnabled: entry.dailyLimitEnabled,
          maxPerDay: entry.maxPerDay,
          allowGroupMeeting: entry.allowGroupMeeting,
          maxPerSlot: entry.maxPerSlot,
          confirmationMessage: entry.confirmationMessage,
          confirmationFlowId: null,
          cancellationFlowId: null,
          externalConnectionId: null,
          active: false,
        },
        ctx.tx,
      )
      await appointmentCalendarRepository.replaceAvailability(
        { calendarId: created.id, availability: entry.availability },
        ctx.tx,
      )

      recordCopy(ctx, {
        category: "calendars",
        resourceKind: "calendar",
        idMapKind: "calendar",
        sourceId: entry.sourceId,
        resourceId: created.id,
      })
      deferFlowRefs(flowRefs, entry, created.id)
    }

    return flowRefs.tasks()
  },

  collector: makeCollector({
    findIds: (query) =>
      db.query.appointmentCalendarModel.findMany({
        where: scopedWhere(query, { deletedAt: { isNull: true } }),
        columns: { id: true },
        limit: query.limit,
      }),

    async collectRows(workspaceId, ids) {
      const rows = await db.query.appointmentCalendarModel.findMany({
        where: { workspaceId, id: { in: [...ids] } },
        with: {
          availability: true,
          reminders: true,
        },
      })

      const entries = rows.map((row) => ({
        sourceId: row.id,
        name: row.name,
        description: row.description,
        timezone: row.timezone,
        locationType: row.locationType,
        locationDetail: row.locationDetail,
        durationMinutes: row.durationMinutes,
        bufferAfterMinutes: row.bufferAfterMinutes,
        scheduleWindowType: row.scheduleWindowType,
        scheduleWindowConfig: row.scheduleWindowConfig,
        maxAppointmentsPerUser: row.maxAppointmentsPerUser,
        dailyLimitEnabled: row.dailyLimitEnabled,
        maxPerDay: row.maxPerDay,
        allowGroupMeeting: row.allowGroupMeeting,
        maxPerSlot: row.maxPerSlot,
        confirmationMessage: row.confirmationMessage,
        confirmationFlowId: row.confirmationFlowId,
        cancellationFlowId: row.cancellationFlowId,
        // Never carried over — same treatment as install time
        // (`externalConnectionId` is dropped and warned about there); collect
        // simply never emits it, so there is nothing for install to drop.
        availability: row.availability.map((slot) => ({
          weekday: slot.weekday,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
        })),
        reminders: row.reminders.map((reminder) => ({
          flowId: reminder.flowId,
          timingValue: reminder.timingValue,
          timingUnit: reminder.timingUnit,
        })),
      }))

      // Every flow a calendar runs travels with it (reminders, booking
      // confirmation, cancellation), like a keyword's flow: a calendar copied
      // without them would silently stop confirming bookings.
      return {
        entries,
        hardDependencies: dependenciesOn(
          "flows",
          rows.flatMap((row) => [
            ...row.reminders.map((reminder) => reminder.flowId),
            row.confirmationFlowId,
            row.cancellationFlowId,
          ]),
        ),
      }
    },
  }),
}

/**
 * The calendar's confirmation and cancellation flows and its reminders point
 * at flows, which insert later: they are written once the flows exist.
 * Reminders that resolve are replaced as one set (none resolved leaves them).
 */
const deferFlowRefs = (
  flowRefs: ReturnType<typeof createFlowRefPatcher>,
  entry: TemplateCalendarEntry,
  calendarId: string,
): void => {
  flowRefs.defer({
    sourceEntryId: entry.sourceId,
    field: "confirmationFlowId",
    sourceFlowId: entry.confirmationFlowId,
    write: async (tx, confirmationFlowId, ctx) => {
      await appointmentCalendarRepository.update(
        { workspaceId: ctx.workspaceId, id: calendarId, confirmationFlowId },
        tx,
      )
    },
  })
  flowRefs.defer({
    sourceEntryId: entry.sourceId,
    field: "cancellationFlowId",
    sourceFlowId: entry.cancellationFlowId,
    write: async (tx, cancellationFlowId, ctx) => {
      await appointmentCalendarRepository.update(
        { workspaceId: ctx.workspaceId, id: calendarId, cancellationFlowId },
        tx,
      )
    },
  })
  const reminders: TemplateCalendarReminder[] = []
  for (const [index, reminder] of entry.reminders.entries()) {
    flowRefs.defer({
      sourceEntryId: entry.sourceId,
      field: `reminders.${index}.flowId`,
      sourceFlowId: reminder.flowId,
      write: (_tx, flowId) => {
        reminders.push({ ...reminder, flowId })
      },
    })
  }
  if (entry.reminders.length === 0) {
    return
  }
  flowRefs.afterWrites(async (ctx) => {
    if (reminders.length > 0) {
      await appointmentCalendarRepository.replaceReminders(
        { calendarId, reminders },
        ctx.tx,
      )
    }
  })
}
