import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNull,
  lte,
} from "@chatbotx.io/database/client"
import { appointmentReminderDispatchStatuses } from "@chatbotx.io/database/partials"
import {
  appointmentModel,
  appointmentReminderDispatchModel,
} from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderBy,
} from "@chatbotx.io/database/utils"
import { createId } from "@chatbotx.io/utils"

export type AppointmentReminderDispatchListInput = {
  workspaceId?: string
  status?: (typeof appointmentReminderDispatchModel.$inferInsert)["status"]
  page?: number
  perPage?: number
  sort?: { id: string; desc: boolean }[]
}

export const appointmentReminderDispatchRepository = {
  async list(
    input: AppointmentReminderDispatchListInput,
    tx: DatabaseClient = db,
  ): Promise<{
    data: (typeof appointmentReminderDispatchModel.$inferSelect)[]
    pageCount: number
    total: number
  }> {
    const pagination = getPaginationWithDefaults(input)
    const where = and(
      input.workspaceId
        ? eq(appointmentReminderDispatchModel.workspaceId, input.workspaceId)
        : undefined,
      input.status
        ? eq(appointmentReminderDispatchModel.status, input.status)
        : undefined,
    )
    const orderBy = parseOrderBy(appointmentReminderDispatchModel, input)
    const order =
      orderBy.length > 0
        ? orderBy
        : [asc(appointmentReminderDispatchModel.sendAt)]
    const [rows, total] = await Promise.all([
      tx
        .select()
        .from(appointmentReminderDispatchModel)
        .where(where)
        .orderBy(...order)
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx.$count(appointmentReminderDispatchModel, where),
    ])

    return {
      data: rows,
      total,
      pageCount: Math.ceil(total / pagination.limit),
    }
  },

  async createPending(
    input: {
      workspaceId: string
      appointmentId: string
      reminderConfigId: string
      contactInboxId?: string | null
      sendAt: Date
      jobId: string
    },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .insert(appointmentReminderDispatchModel)
      .values({
        id: createId(),
        workspaceId: input.workspaceId,
        appointmentId: input.appointmentId,
        reminderConfigId: input.reminderConfigId,
        contactInboxId: input.contactInboxId ?? null,
        sendAt: input.sendAt,
        status: appointmentReminderDispatchStatuses.enum.pending,
        jobId: input.jobId,
      })
      .onConflictDoNothing({
        target: appointmentReminderDispatchModel.jobId,
      })
      .returning()
    if (row) {
      return row
    }

    return await tx.query.appointmentReminderDispatchModel.findFirst({
      where: { jobId: input.jobId },
    })
  },

  async findForSend(
    input: {
      workspaceId: string
      id: string
      appointmentId: string
      reminderConfigId: string
    },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.appointmentReminderDispatchModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
        appointmentId: input.appointmentId,
        reminderConfigId: input.reminderConfigId,
      },
      with: {
        appointment: {
          with: {
            calendar: true,
            conversation: {
              with: {
                contactInboxes: true,
              },
            },
          },
        },
        reminderConfig: true,
        contactInbox: true,
      },
    })
  },

  async listPendingJobIdsForFutureCalendar(
    input: { workspaceId: string; calendarId: string; now?: Date },
    tx: DatabaseClient = db,
  ) {
    const rows = await tx
      .select({
        jobId: appointmentReminderDispatchModel.jobId,
      })
      .from(appointmentReminderDispatchModel)
      .innerJoin(
        appointmentModel,
        eq(appointmentModel.id, appointmentReminderDispatchModel.appointmentId),
      )
      .where(
        and(
          eq(appointmentReminderDispatchModel.workspaceId, input.workspaceId),
          eq(appointmentModel.workspaceId, input.workspaceId),
          eq(appointmentModel.calendarId, input.calendarId),
          eq(appointmentModel.status, "scheduled"),
          gt(appointmentModel.startAt, input.now ?? new Date()),
          isNull(appointmentModel.deletedAt),
          eq(
            appointmentReminderDispatchModel.status,
            appointmentReminderDispatchStatuses.enum.pending,
          ),
        ),
      )
      .orderBy(asc(appointmentModel.startAt))

    return rows.map((row) => row.jobId)
  },

  async markSent(
    input: { workspaceId: string; id: string },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(appointmentReminderDispatchModel)
      .set({
        status: appointmentReminderDispatchStatuses.enum.sent,
        sentAt: new Date(),
      })
      .where(
        and(
          eq(appointmentReminderDispatchModel.id, input.id),
          eq(appointmentReminderDispatchModel.workspaceId, input.workspaceId),
          eq(
            appointmentReminderDispatchModel.status,
            appointmentReminderDispatchStatuses.enum.pending,
          ),
        ),
      )
      .returning()
    return row
  },

  async markCancelledByAppointment(
    input: {
      workspaceId: string
      appointmentId: string
      dispatchIds?: string[]
    },
    tx: DatabaseClient = db,
  ) {
    const where = and(
      eq(appointmentReminderDispatchModel.workspaceId, input.workspaceId),
      eq(appointmentReminderDispatchModel.appointmentId, input.appointmentId),
      eq(
        appointmentReminderDispatchModel.status,
        appointmentReminderDispatchStatuses.enum.pending,
      ),
      input.dispatchIds?.length
        ? inArray(appointmentReminderDispatchModel.id, input.dispatchIds)
        : undefined,
    )
    return await tx
      .update(appointmentReminderDispatchModel)
      .set({
        status: appointmentReminderDispatchStatuses.enum.cancelled,
        cancelledAt: new Date(),
      })
      .where(where)
      .returning()
  },

  async listDuePending(
    input: { now: Date; limit?: number },
    tx: DatabaseClient = db,
  ) {
    return await tx
      .select({
        id: appointmentReminderDispatchModel.id,
        workspaceId: appointmentReminderDispatchModel.workspaceId,
        appointmentId: appointmentReminderDispatchModel.appointmentId,
        reminderConfigId: appointmentReminderDispatchModel.reminderConfigId,
        sendAt: appointmentReminderDispatchModel.sendAt,
        jobId: appointmentReminderDispatchModel.jobId,
      })
      .from(appointmentReminderDispatchModel)
      .where(
        and(
          eq(
            appointmentReminderDispatchModel.status,
            appointmentReminderDispatchStatuses.enum.pending,
          ),
          lte(appointmentReminderDispatchModel.sendAt, input.now),
        ),
      )
      .limit(input.limit ?? 100)
  },

  async markFailedForRetry(
    input: { workspaceId: string; id: string; failedReason?: string | null },
    tx: DatabaseClient = db,
  ) {
    const [row] = await tx
      .update(appointmentReminderDispatchModel)
      .set({
        status: appointmentReminderDispatchStatuses.enum.failed,
        failedReason: input.failedReason ?? null,
      })
      .where(
        and(
          eq(appointmentReminderDispatchModel.id, input.id),
          eq(appointmentReminderDispatchModel.workspaceId, input.workspaceId),
        ),
      )
      .returning()
    return row
  },
}
