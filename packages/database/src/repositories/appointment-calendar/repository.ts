import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  ilike,
  inArray,
  isNull,
} from "@chatbotx.io/database/client"
import {
  appointmentCalendarAvailabilityModel,
  appointmentCalendarModel,
  appointmentCalendarReminderModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderBy,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

export type AppointmentCalendarListInput = {
  workspaceId: string
  search?: string
  page?: number
  perPage?: number
  sort?: { id: string; desc: boolean }[]
}

export type CreateAppointmentCalendarInput = {
  workspaceId: string
  name: string
  timezone: string
  locationType: (typeof appointmentCalendarModel.$inferInsert)["locationType"]
  publicLinkSlug: string
}

export type UpdateAppointmentCalendarInput = {
  workspaceId: string
  id: string
  name?: string
  description?: string | null
  active?: boolean
  timezone?: string
  durationMinutes?: number
  bufferAfterMinutes?: number | null
  locationType?: (typeof appointmentCalendarModel.$inferInsert)["locationType"]
  locationDetail?: string | null
  scheduleWindowType?: (typeof appointmentCalendarModel.$inferInsert)["scheduleWindowType"]
  scheduleWindowConfig?: Record<string, unknown>
  maxAppointmentsPerUser?: number | null
  dailyLimitEnabled?: boolean
  maxPerDay?: number | null
  allowGroupMeeting?: boolean
  maxPerSlot?: number | null
  confirmationMessage?: string | null
  confirmationFlowId?: string | null
  cancellationFlowId?: string | null
  externalConnectionId?: string | null
}

const calendarWhere = (input: { workspaceId: string; search?: string }) =>
  and(
    eq(appointmentCalendarModel.workspaceId, input.workspaceId),
    isNull(appointmentCalendarModel.deletedAt),
    input.search
      ? ilike(appointmentCalendarModel.name, likeContains(input.search))
      : undefined,
  )

export const appointmentCalendarRepository = {
  async list(
    input: AppointmentCalendarListInput,
    tx: DatabaseClient = db,
  ): Promise<{
    data: (typeof appointmentCalendarModel.$inferSelect)[]
    pageCount: number
    total: number
  }> {
    const pagination = getPaginationWithDefaults(input)
    const where = calendarWhere(input)
    const orderBy = parseOrderBy(appointmentCalendarModel, input)
    const order =
      orderBy.length > 0 ? orderBy : [asc(appointmentCalendarModel.name)]
    const [rows, total] = await Promise.all([
      tx
        .select()
        .from(appointmentCalendarModel)
        .where(where)
        .orderBy(...order)
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx.$count(appointmentCalendarModel, where),
    ])

    return {
      data: rows,
      total,
      pageCount: Math.ceil(total / pagination.limit),
    }
  },

  async findBy(
    input: { workspaceId: string; id: string; includeDeleted?: boolean },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.appointmentCalendarModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        deletedAt: input.includeDeleted ? undefined : { isNull: true },
      },
    })
  },

  async findByPublicLinkSlug(
    input: { workspaceId: string; publicLinkSlug: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.appointmentCalendarModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        publicLinkSlug: input.publicLinkSlug,
        deletedAt: { isNull: true },
      },
    })
  },

  async listForFlow(
    input: { workspaceId: string; keyword?: string },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        id: appointmentCalendarModel.id,
        name: appointmentCalendarModel.name,
        active: appointmentCalendarModel.active,
      })
      .from(appointmentCalendarModel)
      .where(
        and(
          eq(appointmentCalendarModel.workspaceId, input.workspaceId),
          isNull(appointmentCalendarModel.deletedAt),
          input.keyword
            ? ilike(appointmentCalendarModel.name, likeContains(input.keyword))
            : undefined,
        ),
      )
      .orderBy(asc(appointmentCalendarModel.name))
  },

  async getForEdit(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.appointmentCalendarModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        deletedAt: { isNull: true },
      },
      with: {
        availability: {
          orderBy: { weekday: "asc", startMinute: "asc" },
        },
        reminders: {
          orderBy: { timingValue: "asc" },
        },
      },
    })
  },

  async create(input: CreateAppointmentCalendarInput, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(appointmentCalendarModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        name: input.name,
        timezone: input.timezone,
        locationType: input.locationType,
        publicLinkSlug: input.publicLinkSlug,
      })
      .returning()
    return row
  },

  async update(input: UpdateAppointmentCalendarInput, tx: DatabaseClient = db) {
    const [row] = await tx
      .update(appointmentCalendarModel)
      .set({
        name: input.name,
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
      })
      .where(
        and(
          eq(appointmentCalendarModel.id, input.id),
          eq(appointmentCalendarModel.workspaceId, input.workspaceId),
          isNull(appointmentCalendarModel.deletedAt),
        ),
      )
      .returning()
    return row
  },

  async softDeleteMany(
    input: { workspaceId: string; ids: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.ids.length === 0) {
      return []
    }

    return await tx
      .update(appointmentCalendarModel)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(appointmentCalendarModel.workspaceId, input.workspaceId),
          inArray(appointmentCalendarModel.id, input.ids),
          isNull(appointmentCalendarModel.deletedAt),
        ),
      )
      .returning({ id: appointmentCalendarModel.id })
  },

  async replaceAvailability(
    input: {
      calendarId: string
      availability: {
        weekday: number
        startMinute: number
        endMinute: number
      }[]
    },
    tx: DatabaseClient = db,
  ) {
    await tx
      .delete(appointmentCalendarAvailabilityModel)
      .where(
        eq(appointmentCalendarAvailabilityModel.calendarId, input.calendarId),
      )

    if (input.availability.length === 0) {
      return []
    }

    return await tx
      .insert(appointmentCalendarAvailabilityModel)
      .values(
        input.availability.map((availability) => ({
          id: createId(),
          calendarId: input.calendarId,
          weekday: availability.weekday,
          startMinute: availability.startMinute,
          endMinute: availability.endMinute,
        })),
      )
      .returning()
  },

  async replaceReminders(
    input: {
      calendarId: string
      reminders: {
        flowId: string
        timingValue: number
        timingUnit: (typeof appointmentCalendarReminderModel.$inferInsert)["timingUnit"]
      }[]
    },
    tx: DatabaseClient = db,
  ) {
    const existing = await tx.query.appointmentCalendarReminderModel.findMany({
      where: { calendarId: input.calendarId },
    })
    const keyOf = (reminder: {
      flowId: string
      timingValue: number
      timingUnit: (typeof appointmentCalendarReminderModel.$inferInsert)["timingUnit"]
    }) => `${reminder.flowId}:${reminder.timingValue}:${reminder.timingUnit}`

    const nextKeys = new Set(input.reminders.map(keyOf))
    const existingKeys = new Set(existing.map(keyOf))
    const deleteIds = existing
      .filter((reminder) => !nextKeys.has(keyOf(reminder)))
      .map((reminder) => reminder.id)

    if (deleteIds.length > 0) {
      await tx
        .delete(appointmentCalendarReminderModel)
        .where(inArray(appointmentCalendarReminderModel.id, deleteIds))
    }

    const remindersToInsert = input.reminders.filter(
      (reminder) => !existingKeys.has(keyOf(reminder)),
    )
    if (remindersToInsert.length === 0) {
      return existing.filter((reminder) => nextKeys.has(keyOf(reminder)))
    }

    const inserted = await tx
      .insert(appointmentCalendarReminderModel)
      .values(
        remindersToInsert.map((reminder) => ({
          id: createId(),
          calendarId: input.calendarId,
          flowId: reminder.flowId,
          timingValue: reminder.timingValue,
          timingUnit: reminder.timingUnit,
        })),
      )
      .returning()

    return [
      ...existing.filter((reminder) => nextKeys.has(keyOf(reminder))),
      ...inserted,
    ]
  },
}
