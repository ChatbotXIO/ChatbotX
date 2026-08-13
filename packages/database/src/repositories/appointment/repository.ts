import {
  and,
  asc,
  count,
  type DatabaseClient,
  db,
  desc,
  eq,
  gt,
  ilike,
  isNull,
  lte,
  or,
  sql,
} from "@chatbotx.io/database/client"
import {
  appointmentCalendarModel,
  appointmentModel,
  contactModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

export type AppointmentListTab = "next" | "past"

export type AppointmentListInput = {
  workspaceId: string
  calendarId?: string
  search?: string | null
  tab?: AppointmentListTab
  page?: number
  perPage?: number
}

export type CreateAppointmentInput = {
  workspaceId: string
  calendarId: string
  contactId: string
  conversationId?: string | null
  startAt: Date
  endAt: Date
  inviteeTimezone: string
  locationType: (typeof appointmentModel.$inferInsert)["locationType"]
  locationDetail?: string | null
  externalSyncStatus?: (typeof appointmentModel.$inferInsert)["externalSyncStatus"]
}

const appointmentWhere = (input: AppointmentListInput, now = new Date()) =>
  and(
    eq(appointmentModel.workspaceId, input.workspaceId),
    isNull(appointmentModel.deletedAt),
    input.calendarId
      ? eq(appointmentModel.calendarId, input.calendarId)
      : undefined,
    input.tab === "past"
      ? lte(appointmentModel.startAt, now)
      : gt(appointmentModel.startAt, now),
    input.search
      ? or(
          ilike(contactModel.fullName, likeContains(input.search)),
          ilike(contactModel.firstName, likeContains(input.search)),
          ilike(contactModel.lastName, likeContains(input.search)),
        )
      : undefined,
  )

type AppointmentListRow = typeof appointmentModel.$inferSelect & {
  calendarName: string
  contactFirstName: string | null
  contactLastName: string | null
  contactFullName: string | null
}

export const appointmentRepository = {
  async list(
    input: AppointmentListInput,
    tx: DatabaseClient = db,
  ): Promise<{
    data: AppointmentListRow[]
    pageCount: number
    total: number
  }> {
    const pagination = getPaginationWithDefaults(input)
    const where = appointmentWhere(input)
    const [rows, totalRows] = await Promise.all([
      tx
        .select({
          id: appointmentModel.id,
          createdAt: appointmentModel.createdAt,
          updatedAt: appointmentModel.updatedAt,
          workspaceId: appointmentModel.workspaceId,
          calendarId: appointmentModel.calendarId,
          contactId: appointmentModel.contactId,
          conversationId: appointmentModel.conversationId,
          startAt: appointmentModel.startAt,
          endAt: appointmentModel.endAt,
          inviteeTimezone: appointmentModel.inviteeTimezone,
          status: appointmentModel.status,
          locationType: appointmentModel.locationType,
          locationDetail: appointmentModel.locationDetail,
          externalEventId: appointmentModel.externalEventId,
          externalSyncStatus: appointmentModel.externalSyncStatus,
          cancelledAt: appointmentModel.cancelledAt,
          deletedAt: appointmentModel.deletedAt,
          calendarName: appointmentCalendarModel.name,
          contactFirstName: contactModel.firstName,
          contactLastName: contactModel.lastName,
          contactFullName: contactModel.fullName,
        })
        .from(appointmentModel)
        .innerJoin(
          appointmentCalendarModel,
          eq(appointmentCalendarModel.id, appointmentModel.calendarId),
        )
        .innerJoin(
          contactModel,
          eq(contactModel.id, appointmentModel.contactId),
        )
        .where(where)
        .orderBy(desc(appointmentModel.startAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx
        .select({ count: count() })
        .from(appointmentModel)
        .innerJoin(
          appointmentCalendarModel,
          eq(appointmentCalendarModel.id, appointmentModel.calendarId),
        )
        .innerJoin(
          contactModel,
          eq(contactModel.id, appointmentModel.contactId),
        )
        .where(where),
    ])
    const total = Number(totalRows[0]?.count ?? 0)

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
    return await tx.query.appointmentModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        deletedAt: input.includeDeleted ? undefined : { isNull: true },
      },
      with: {
        calendar: true,
        contact: true,
        conversation: true,
      },
    })
  },

  async create(input: CreateAppointmentInput, tx: DatabaseClient = db) {
    const [row] = await tx
      .insert(appointmentModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        contactId: input.contactId,
        conversationId: input.conversationId ?? null,
        startAt: input.startAt,
        endAt: input.endAt,
        inviteeTimezone: input.inviteeTimezone,
        locationType: input.locationType,
        locationDetail: input.locationDetail ?? null,
        externalSyncStatus: input.externalSyncStatus,
      })
      .returning()
    return row
  },

  async listFutureScheduledForContact(
    input: { workspaceId: string; calendarId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.appointmentModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        contactId: input.contactId,
        status: "scheduled",
        startAt: { gt: new Date() },
        deletedAt: { isNull: true },
      },
      orderBy: { startAt: "asc" },
      with: {
        calendar: true,
      },
    })
  },

  async listFutureScheduledByCalendar(
    input: { workspaceId: string; calendarId: string; now?: Date },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.appointmentModel.findMany({
      where: {
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        status: "scheduled",
        startAt: { gt: input.now ?? new Date() },
        deletedAt: { isNull: true },
      },
      columns: {
        id: true,
        workspaceId: true,
        calendarId: true,
        startAt: true,
      },
      orderBy: { startAt: "asc" },
    })
  },

  async listByContact(
    input: { workspaceId: string; contactId: string; limit?: number },
    tx: DatabaseClient = db,
  ) {
    const now = new Date()
    return await tx
      .select({
        id: appointmentModel.id,
        workspaceId: appointmentModel.workspaceId,
        calendarId: appointmentModel.calendarId,
        contactId: appointmentModel.contactId,
        conversationId: appointmentModel.conversationId,
        startAt: appointmentModel.startAt,
        endAt: appointmentModel.endAt,
        inviteeTimezone: appointmentModel.inviteeTimezone,
        status: appointmentModel.status,
        calendarName: appointmentCalendarModel.name,
      })
      .from(appointmentModel)
      .innerJoin(
        appointmentCalendarModel,
        eq(appointmentCalendarModel.id, appointmentModel.calendarId),
      )
      .where(
        and(
          eq(appointmentModel.workspaceId, input.workspaceId),
          eq(appointmentModel.contactId, input.contactId),
          isNull(appointmentModel.deletedAt),
        ),
      )
      .orderBy(
        sql`case when ${appointmentModel.startAt} >= ${now} then 0 else 1 end`,
        asc(
          sql`case when ${appointmentModel.startAt} >= ${now} then ${appointmentModel.startAt} end`,
        ),
        desc(
          sql`case when ${appointmentModel.startAt} < ${now} then ${appointmentModel.startAt} end`,
        ),
      )
      .limit(input.limit ?? 20)
  },

  async update(
    input: {
      workspaceId: string
      id: string
      status?: (typeof appointmentModel.$inferInsert)["status"]
      externalEventId?: string | null
      externalSyncStatus?: (typeof appointmentModel.$inferInsert)["externalSyncStatus"]
      cancelledAt?: Date | null
      deletedAt?: Date | null
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(appointmentModel)
      .set({
        status: input.status,
        externalEventId: input.externalEventId,
        externalSyncStatus: input.externalSyncStatus,
        cancelledAt: input.cancelledAt,
        deletedAt: input.deletedAt,
      })
      .where(
        and(
          eq(appointmentModel.id, input.id),
          eq(appointmentModel.workspaceId, input.workspaceId),
          isNull(appointmentModel.deletedAt),
        ),
      )
      .returning()
    return row
  },

  async cancelScheduled(
    input: {
      workspaceId: string
      id: string
      cancelledAt: Date
      externalSyncStatus?: (typeof appointmentModel.$inferInsert)["externalSyncStatus"]
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(appointmentModel)
      .set({
        status: "cancelled",
        cancelledAt: input.cancelledAt,
        externalSyncStatus: input.externalSyncStatus,
      })
      .where(
        and(
          eq(appointmentModel.id, input.id),
          eq(appointmentModel.workspaceId, input.workspaceId),
          eq(appointmentModel.status, "scheduled"),
          gt(appointmentModel.startAt, new Date()),
          isNull(appointmentModel.deletedAt),
        ),
      )
      .returning()
    return row
  },

  async softDelete(
    input: {
      workspaceId: string
      id: string
      deletedAt: Date
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(appointmentModel)
      .set({
        deletedAt: input.deletedAt,
      })
      .where(
        and(
          eq(appointmentModel.id, input.id),
          eq(appointmentModel.workspaceId, input.workspaceId),
          isNull(appointmentModel.deletedAt),
        ),
      )
      .returning()
    return row
  },
}
