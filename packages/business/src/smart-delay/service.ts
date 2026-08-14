import {
  and,
  count,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
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
export type SmartDelayStepCountRow = {
  stepId: string
  status: SmartDelayStatus
  total: number
}

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
        targetWhere: sql`${contactOnSmartDelayModel.status} NOT IN ('completed', 'failed', 'canceled') AND ${contactOnSmartDelayModel.type} = 'followUp'`,
        set: {
          conversationId: data.conversationId,
          appointmentId: data.appointmentId,
          createdAt: now,
          flowVersionId: data.flowVersionId,
          metadata: data.metadata,
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

  async countByFlowStep(props: {
    tx?: DatabaseClient
    workspaceId: string
    flowId: string
  }): Promise<SmartDelayStepCountRow[]> {
    const { tx = db, workspaceId, flowId } = props
    const rows = await tx
      .select({
        stepId: contactOnSmartDelayModel.stepId,
        status: contactOnSmartDelayModel.status,
        total: count(),
      })
      .from(contactOnSmartDelayModel)
      .where(
        and(
          eq(contactOnSmartDelayModel.workspaceId, workspaceId),
          eq(contactOnSmartDelayModel.flowId, flowId),
          isNotNull(contactOnSmartDelayModel.stepId),
        ),
      )
      .groupBy(contactOnSmartDelayModel.stepId, contactOnSmartDelayModel.status)

    return rows.flatMap((row) =>
      row.stepId
        ? [
            {
              stepId: row.stepId,
              status: smartDelayStatuses.parse(row.status),
              total: Number(row.total),
            },
          ]
        : [],
    )
  }

  // Claims one bounded batch: this table can grow by hundreds of thousands of
  // rows per minute, so the claim must never load the whole backlog at once.
  // FOR UPDATE SKIP LOCKED lets concurrent scanner runs split the backlog
  // instead of double-claiming the same rows.
  async claimDueRows(props: {
    tx?: DatabaseClient
    windowUntil: Date
    limit: number
  }): Promise<SmartDelayRow[]> {
    const { tx = db, windowUntil, limit } = props
    const dueRowIds = tx
      .select({ id: contactOnSmartDelayModel.id })
      .from(contactOnSmartDelayModel)
      .where(
        and(
          eq(contactOnSmartDelayModel.status, smartDelayStatuses.enum.pending),
          lte(contactOnSmartDelayModel.triggerAt, windowUntil),
        ),
      )
      .orderBy(contactOnSmartDelayModel.triggerAt)
      .limit(limit)
      .for("update", { skipLocked: true })

    const rows = await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.scheduled })
      .where(
        and(
          eq(contactOnSmartDelayModel.status, smartDelayStatuses.enum.pending),
          inArray(contactOnSmartDelayModel.id, dueRowIds),
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

  // Recovery input for the scanner sweeper: scheduled rows whose wake-up never
  // ran (lost or stuck BullMQ job). Returns triggerAt too so the caller can
  // rebuild the deterministic jobId and remove the stale job BEFORE the row is
  // reset to pending — otherwise the re-add is dropped as a BullMQ duplicate.
  async listStuckScheduled(props: {
    tx?: DatabaseClient
    olderThan: Date
    limit: number
  }): Promise<Pick<SmartDelayRow, "id" | "triggerAt">[]> {
    const { tx = db, olderThan, limit } = props
    return await tx
      .select({
        id: contactOnSmartDelayModel.id,
        triggerAt: contactOnSmartDelayModel.triggerAt,
      })
      .from(contactOnSmartDelayModel)
      .where(
        and(
          eq(
            contactOnSmartDelayModel.status,
            smartDelayStatuses.enum.scheduled,
          ),
          lt(contactOnSmartDelayModel.triggerAt, olderThan),
        ),
      )
      .orderBy(contactOnSmartDelayModel.triggerAt)
      .limit(limit)
  }

  // CAS: only rows still 'scheduled' go back to pending. A concurrent resume
  // may complete/cancel a row between the caller's read and this write — an
  // unguarded reset would resurrect it and re-run its side effects.
  // `triggerAtBefore` (sweep path) additionally skips rows that were
  // rescheduled to a fresh future triggerAt in that same window.
  // Returns how many rows were actually reset.
  async resetToPending(props: {
    tx?: DatabaseClient
    ids: string[]
    triggerAtBefore?: Date
  }): Promise<number> {
    const { tx = db, ids, triggerAtBefore } = props
    if (ids.length === 0) {
      return 0
    }

    const rows = await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.pending })
      .where(
        and(
          inArray(contactOnSmartDelayModel.id, ids),
          eq(
            contactOnSmartDelayModel.status,
            smartDelayStatuses.enum.scheduled,
          ),
          triggerAtBefore
            ? lt(contactOnSmartDelayModel.triggerAt, triggerAtBefore)
            : undefined,
        ),
      )
      .returning({ id: contactOnSmartDelayModel.id })

    return rows.length
  }

  /**
   * Cancels one bounded batch of a workspace's still-firable rows (freeze /
   * teardown path) and returns `id` + `triggerAt` so the caller can rebuild the
   * deterministic jobId and drop the matching delayed BullMQ job.
   *
   * Cancelling the ROW is what actually stops the work: removing only the job
   * leaves the row `scheduled`, and the scanner's stuck-row sweeper would reset
   * it to `pending` and re-enqueue it on the next tick. `resetToPending` uses a
   * `status = 'scheduled'` CAS, so a `canceled` row can never be resurrected.
   *
   * Bounded + SKIP LOCKED for the same reason as `claimDueRows`: this table can
   * hold hundreds of thousands of rows per workspace, and a concurrent scanner
   * run must not be blocked by the teardown.
   */
  async cancelActiveForWorkspace(props: {
    tx?: DatabaseClient
    workspaceId: string
    limit: number
  }): Promise<Pick<SmartDelayRow, "id" | "triggerAt">[]> {
    const { tx = db, workspaceId, limit } = props
    const activeRowIds = tx
      .select({ id: contactOnSmartDelayModel.id })
      .from(contactOnSmartDelayModel)
      .where(
        and(
          eq(contactOnSmartDelayModel.workspaceId, workspaceId),
          inArray(contactOnSmartDelayModel.status, [
            smartDelayStatuses.enum.pending,
            smartDelayStatuses.enum.scheduled,
          ]),
        ),
      )
      .orderBy(contactOnSmartDelayModel.triggerAt)
      .limit(limit)
      .for("update", { skipLocked: true })

    return await tx
      .update(contactOnSmartDelayModel)
      .set({ status: smartDelayStatuses.enum.canceled })
      .where(inArray(contactOnSmartDelayModel.id, activeRowIds))
      .returning({
        id: contactOnSmartDelayModel.id,
        triggerAt: contactOnSmartDelayModel.triggerAt,
      })
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
