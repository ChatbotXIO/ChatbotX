import { db } from "@chatbotx.io/database/client"
import type {
  AppointmentLocationType,
  AppointmentReminderTimingUnit,
  AppointmentScheduleWindowType,
} from "@chatbotx.io/database/partials"
import { appointmentCalendarRepository } from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import type {
  PatchTask,
  ResourceAdapter,
  ResourceCollector,
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
export const calendarsAdapter: ResourceAdapter = {
  category: "calendars",
  providesKinds: ["calendar"],
  consumesKinds: ["flow"],
  deferredKinds: ["flow"],

  async insert(
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ): Promise<PatchTask[]> {
    if (!ctx.idMaps.calendar) {
      ctx.idMaps.calendar = new Map()
    }
    const idMap = ctx.idMaps.calendar
    const pendingFlowRefs: Array<{
      calendarId: string
      confirmationFlowSourceId: string | null
      cancellationFlowSourceId: string | null
      reminders: TemplateCalendarReminder[]
    }> = []

    for (const rawEntry of entries) {
      const entry = rawEntry as unknown as TemplateCalendarEntry
      if (entry.externalConnectionId) {
        ctx.warn({
          category: "calendars",
          entityKind: "integration",
          path: `calendars.${entry.sourceId}.externalConnectionId`,
          value: entry.externalConnectionId,
        })
      }

      const created = await appointmentCalendarRepository.create(
        {
          workspaceId: ctx.workspaceId,
          name: entry.name,
          timezone: entry.timezone,
          locationType: entry.locationType,
          publicLinkSlug: createId().toString(),
        },
        ctx.tx,
      )
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

      idMap.set(entry.sourceId, created.id)
      pendingFlowRefs.push({
        calendarId: created.id,
        confirmationFlowSourceId: entry.confirmationFlowId,
        cancellationFlowSourceId: entry.cancellationFlowId,
        reminders: entry.reminders,
      })
      ctx.track({
        category: "calendars",
        resourceKind: "calendar",
        resourceId: created.id,
        sourceResourceId: entry.sourceId,
        wasExisting: false,
      })
    }

    return [
      {
        category: "calendars",
        apply: async (patchCtx) => {
          for (const pending of pendingFlowRefs) {
            await patchCalendarFlowRefs(patchCtx, pending)
          }
        },
      },
    ]
  },

  collector: {
    async resolveIds(workspaceId) {
      const rows = await db.query.appointmentCalendarModel.findMany({
        where: { workspaceId, deletedAt: { isNull: true as const } },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async verifyOwnership(workspaceId, ids) {
      const uniqueIds = [...new Set(ids)]
      if (uniqueIds.length === 0) {
        return []
      }
      const rows = await db.query.appointmentCalendarModel.findMany({
        where: {
          workspaceId,
          id: { in: uniqueIds },
          deletedAt: { isNull: true as const },
        },
        columns: { id: true },
      })
      return rows.map((row) => row.id)
    },

    async collect(workspaceId, ids) {
      if (ids.length === 0) {
        return {
          entries: [],
          folderIds: [],
          productCategoryIds: [],
          hardDependencies: [],
        }
      }
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

      // `reminders[].flowId` is NOT NULL on the row — per the same save-time
      // rule `entryPointLinks` depends on (G9), every reminder's flow must be
      // auto-included even if not explicitly selected. `confirmationFlowId`/
      // `cancellationFlowId` are nullable and simply degrade to a warn+skip
      // at install time if left unselected, so they are not hard
      // dependencies.
      const hardDependencies = rows.flatMap((row) =>
        row.reminders.map((reminder) => ({
          category: "flows" as const,
          sourceId: reminder.flowId,
        })),
      )

      return {
        entries,
        folderIds: [],
        productCategoryIds: [],
        hardDependencies,
      }
    },
  } satisfies ResourceCollector,
}

const resolveFlowRef = (
  ctx: TemplateInstallContext,
  calendarId: string,
  field: string,
  flowSourceId: string | null,
): string | null => {
  if (!flowSourceId) {
    return null
  }
  const targetId = ctx.idMaps.flow?.get(flowSourceId)
  if (!targetId) {
    ctx.warn({
      category: "calendars",
      entityKind: "flow",
      path: `calendars.${calendarId}.${field}`,
      value: flowSourceId,
    })
    return null
  }
  return targetId
}

const patchCalendarFlowRefs = async (
  ctx: TemplateInstallContext,
  pending: {
    calendarId: string
    confirmationFlowSourceId: string | null
    cancellationFlowSourceId: string | null
    reminders: TemplateCalendarReminder[]
  },
): Promise<void> => {
  const confirmationFlowId = resolveFlowRef(
    ctx,
    pending.calendarId,
    "confirmationFlowId",
    pending.confirmationFlowSourceId,
  )
  const cancellationFlowId = resolveFlowRef(
    ctx,
    pending.calendarId,
    "cancellationFlowId",
    pending.cancellationFlowSourceId,
  )
  await appointmentCalendarRepository.update(
    {
      workspaceId: ctx.workspaceId,
      id: pending.calendarId,
      confirmationFlowId,
      cancellationFlowId,
    },
    ctx.tx,
  )

  const resolvedReminders = pending.reminders.flatMap((reminder) => {
    const targetFlowId = ctx.idMaps.flow?.get(reminder.flowId)
    if (!targetFlowId) {
      ctx.warn({
        category: "calendars",
        entityKind: "flow",
        path: `calendars.${pending.calendarId}.reminders.flowId`,
        value: reminder.flowId,
      })
      return []
    }
    return [
      {
        flowId: targetFlowId,
        timingValue: reminder.timingValue,
        timingUnit: reminder.timingUnit,
      },
    ]
  })
  if (resolvedReminders.length > 0) {
    await appointmentCalendarRepository.replaceReminders(
      { calendarId: pending.calendarId, reminders: resolvedReminders },
      ctx.tx,
    )
  }
}
