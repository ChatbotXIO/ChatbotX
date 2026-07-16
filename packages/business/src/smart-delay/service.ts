import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  lt,
  lte,
  sql,
} from "@chatbotx.io/database/client"
import {
  type SmartDelayStatus,
  type SmartDelayType,
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import { contactOnSmartDelayModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

export type SmartDelayRow = Omit<
  typeof contactOnSmartDelayModel.$inferSelect,
  "status" | "type"
> & {
  status: SmartDelayStatus
  type: SmartDelayType
}
export type SmartDelayInsert = typeof contactOnSmartDelayModel.$inferInsert

const toSmartDelayRow = (
  row: typeof contactOnSmartDelayModel.$inferSelect,
): SmartDelayRow => ({
  ...row,
  status: smartDelayStatuses.parse(row.status),
  type: smartDelayTypes.parse(row.type),
})

class SmartDelayService extends BaseService {
  async create(props: {
    tx?: DatabaseClient
    data: SmartDelayInsert
  }): Promise<void> {
    const { tx = db, data } = props
    await tx.insert(contactOnSmartDelayModel).values(data)
  }

  async upsertFollowUp(props: {
    tx?: DatabaseClient
    data: SmartDelayInsert
  }): Promise<SmartDelayRow> {
    const { tx = db, data } = props
    const now = new Date()
    const [row] = await tx
      .insert(contactOnSmartDelayModel)
      .values(data)
      .onConflictDoUpdate({
        target: [
          contactOnSmartDelayModel.workspaceId,
          contactOnSmartDelayModel.contactInboxId,
          contactOnSmartDelayModel.flowId,
          contactOnSmartDelayModel.stepId,
        ],
        targetWhere: sql`${contactOnSmartDelayModel.status} IN ('pending', 'scheduled') AND ${contactOnSmartDelayModel.type} = 'followUp'`,
        set: {
          conversationId: data.conversationId,
          createdAt: now,
          flowVersionId: data.flowVersionId,
          nodeId: data.nodeId,
          status: smartDelayStatuses.enum.pending,
          triggerAt: data.triggerAt,
        },
      })
      .returning()

    if (!row) {
      throw new Error("Failed to upsert follow-up smart delay")
    }

    return toSmartDelayRow(row)
  }

  async markScheduled(props: {
    tx?: DatabaseClient
    id: string
  }): Promise<void> {
    await this.markStatus({
      tx: props.tx,
      id: props.id,
      status: smartDelayStatuses.enum.scheduled,
    })
  }

  async markCompleted(props: {
    tx?: DatabaseClient
    id: string
  }): Promise<void> {
    await this.markStatus({
      tx: props.tx,
      id: props.id,
      status: smartDelayStatuses.enum.completed,
    })
  }

  async markCanceled(props: {
    tx?: DatabaseClient
    id: string
  }): Promise<void> {
    await this.markStatus({
      tx: props.tx,
      id: props.id,
      status: smartDelayStatuses.enum.canceled,
    })
  }

  async findById(props: {
    tx?: DatabaseClient
    id: string
  }): Promise<SmartDelayRow | null> {
    const { tx = db, id } = props
    const row = await tx.query.contactOnSmartDelayModel.findFirst({
      where: { id },
    })
    return row ? toSmartDelayRow(row) : null
  }

  async claimDueRows(props: {
    tx?: DatabaseClient
    windowUntil: Date
  }): Promise<SmartDelayRow[]> {
    const { tx = db, windowUntil } = props
    const rows = await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.scheduled })
      .where(
        and(
          eq(contactOnSmartDelayModel.status, smartDelayStatuses.enum.pending),
          lte(contactOnSmartDelayModel.triggerAt, windowUntil),
        ),
      )
      .returning()

    return rows.map(toSmartDelayRow)
  }

  async claimForRun(props: {
    tx?: DatabaseClient
    id: string
    to: "completed" | "canceled"
  }): Promise<boolean> {
    const { tx = db, id, to } = props
    const rows = await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum[to] })
      .where(
        and(
          eq(contactOnSmartDelayModel.id, id),
          eq(
            contactOnSmartDelayModel.status,
            smartDelayStatuses.enum.scheduled,
          ),
        ),
      )
      .returning({ id: contactOnSmartDelayModel.id })

    return rows.length > 0
  }

  async sweepStuckScheduled(props: {
    tx?: DatabaseClient
    olderThan: Date
  }): Promise<number> {
    const { tx = db, olderThan } = props
    const rows = await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.pending })
      .where(
        and(
          eq(
            contactOnSmartDelayModel.status,
            smartDelayStatuses.enum.scheduled,
          ),
          lt(contactOnSmartDelayModel.triggerAt, olderThan),
        ),
      )
      .returning({ id: contactOnSmartDelayModel.id })

    return rows.length
  }

  async resetToPending(props: {
    tx?: DatabaseClient
    ids: string[]
  }): Promise<void> {
    const { tx = db, ids } = props
    if (ids.length === 0) {
      return
    }

    await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.pending })
      .where(inArray(contactOnSmartDelayModel.id, ids))
  }

  private async markStatus(props: {
    tx?: DatabaseClient
    id: string
    status: SmartDelayStatus
  }): Promise<void> {
    const { tx = db, id, status } = props
    await tx
      .update(contactOnSmartDelayModel)
      .set({ status })
      .where(eq(contactOnSmartDelayModel.id, id))
  }
}

export const smartDelayService = new SmartDelayService()
