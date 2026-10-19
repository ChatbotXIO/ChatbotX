import {
  and,
  count,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "../../client"
import { conversationModel, responseSlaPolicyModel } from "../../schema"
import type { ResponseSlaPolicyModel } from "../../types"

export type ResponseSlaPolicyInput = {
  enabled: boolean
  firstResponseTargetSeconds: number
  nextResponseTargetSeconds: number | null
  breachingThresholdPercent: number
}

/** The waiting-window state SLA bookkeeping needs; one row per conversation. */
export type ResponseSlaWindowState = {
  id: string
  sourceId: string | null
  awaitingHumanReplySince: Date | null
  assignedUserId: string | null
  assignedUserAt: Date | null
  adminRepliedAt: Date | null
  responseDueAt: Date | null
  responseSlaTargetSeconds: number | null
}

const windowStateColumns = {
  id: conversationModel.id,
  sourceId: conversationModel.sourceId,
  awaitingHumanReplySince: conversationModel.awaitingHumanReplySince,
  assignedUserId: conversationModel.assignedUserId,
  assignedUserAt: conversationModel.assignedUserAt,
  adminRepliedAt: conversationModel.adminRepliedAt,
  responseDueAt: conversationModel.responseDueAt,
  responseSlaTargetSeconds: conversationModel.responseSlaTargetSeconds,
}

export const responseSlaRepository = {
  async findPolicy(
    props: { workspaceId: string },
    client: DatabaseClient = db,
  ): Promise<ResponseSlaPolicyModel | undefined> {
    const [row] = await client
      .select()
      .from(responseSlaPolicyModel)
      .where(eq(responseSlaPolicyModel.workspaceId, props.workspaceId))
      .limit(1)
    return row
  },

  /** One policy per workspace: insert, or replace the existing row's values. */
  async upsertPolicy(
    props: { workspaceId: string; data: ResponseSlaPolicyInput },
    client: DatabaseClient = db,
  ): Promise<ResponseSlaPolicyModel> {
    const [row] = await client
      .insert(responseSlaPolicyModel)
      .values({ workspaceId: props.workspaceId, ...props.data })
      .onConflictDoUpdate({
        target: responseSlaPolicyModel.workspaceId,
        set: { ...props.data, updatedAt: new Date() },
      })
      .returning()
    return row
  },

  async deletePolicy(
    props: { workspaceId: string },
    client: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await client
      .delete(responseSlaPolicyModel)
      .where(eq(responseSlaPolicyModel.workspaceId, props.workspaceId))
      .returning({ id: responseSlaPolicyModel.id })
    return rows.length > 0
  },

  /**
   * Reads the window state of conversations, optionally locking the rows
   * (`FOR NO KEY UPDATE`, ascending id so two callers cannot deadlock). Take
   * the lock BEFORE the statement that moves the window so the before/after
   * comparison is serialized with every other writer.
   */
  async readWindowStates(
    props: { workspaceId: string; ids: readonly string[]; lock: boolean },
    client: DatabaseClient,
  ): Promise<ResponseSlaWindowState[]> {
    if (props.ids.length === 0) {
      return []
    }
    const query = client
      .select(windowStateColumns)
      .from(conversationModel)
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          inArray(conversationModel.id, [...props.ids]),
        ),
      )
      .orderBy(conversationModel.id)
    return props.lock ? await query.for("no key update") : await query
  },

  /**
   * Whether every given conversation is already settled for SLA purposes: its
   * DM waiting window is open (a comment thread never gets an SLA). One cheap
   * count instead of reading the rows; unlocked, so only a hint.
   */
  async areWindowsAlreadyOpen(
    props: { workspaceId: string; ids: readonly string[] },
    client: DatabaseClient = db,
  ): Promise<boolean> {
    if (props.ids.length === 0) {
      return false
    }
    const [row] = await client
      .select({ settled: count() })
      .from(conversationModel)
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          inArray(conversationModel.id, [...props.ids]),
          or(
            isNotNull(conversationModel.sourceId),
            isNotNull(conversationModel.awaitingHumanReplySince),
          ),
        ),
      )
    return row?.settled === props.ids.length
  },

  /** Current assignee of each conversation, unlocked: only to warm caches before a lock is taken. */
  async readAssigneeIds(
    props: { workspaceId: string; ids: readonly string[] },
    client: DatabaseClient = db,
  ): Promise<string[]> {
    if (props.ids.length === 0) {
      return []
    }
    const rows = await client
      .selectDistinct({ assignedUserId: conversationModel.assignedUserId })
      .from(conversationModel)
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          inArray(conversationModel.id, [...props.ids]),
        ),
      )
    return rows.flatMap((row) =>
      row.assignedUserId ? [row.assignedUserId] : [],
    )
  },

  /**
   * Writes the SLA snapshot of an open window — only while that window is still
   * the one the caller computed it for (`awaitingHumanReplySince` unchanged), so
   * a close or reopen that raced in leaves no stale deadline behind. Returns
   * whether the row was updated.
   */
  async setSnapshotIfWindowUnchanged(
    props: {
      workspaceId: string
      id: string
      expectedSince: Date
      snapshot: {
        responseDueAt: Date
        responseSlaBreachingAt: Date
        responseSlaTargetSeconds: number
      }
    },
    client: DatabaseClient,
  ): Promise<boolean> {
    // Share-lock the policy row without waiting: a switch-off or removal holds
    // it exclusively while it clears every snapshot, and waiting for it here
    // (with this conversation already locked) could deadlock against that
    // clear. A locked or missing or disabled policy means no deadline is
    // written; one that commits first is seen as disabled by the next writer.
    const [policy] = await client
      .select({ enabled: responseSlaPolicyModel.enabled })
      .from(responseSlaPolicyModel)
      .where(eq(responseSlaPolicyModel.workspaceId, props.workspaceId))
      .for("share", { skipLocked: true })
    if (!policy?.enabled) {
      return false
    }
    const rows = await client
      .update(conversationModel)
      .set(props.snapshot)
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          eq(conversationModel.id, props.id),
          eq(
            conversationModel.awaitingHumanReplySince,
            sql`${props.expectedSince.toISOString()}::timestamptz`,
          ),
          isNull(conversationModel.sourceId),
        ),
      )
      .returning({ id: conversationModel.id })
    return rows.length > 0
  },

  /** Drops the snapshot of the window it was computed for (same guard as the write). */
  async clearSnapshotIfWindowUnchanged(
    props: { workspaceId: string; id: string; expectedSince: Date },
    client: DatabaseClient,
  ): Promise<boolean> {
    const rows = await client
      .update(conversationModel)
      .set({
        responseDueAt: null,
        responseSlaBreachingAt: null,
        responseSlaTargetSeconds: null,
      })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          eq(conversationModel.id, props.id),
          eq(
            conversationModel.awaitingHumanReplySince,
            sql`${props.expectedSince.toISOString()}::timestamptz`,
          ),
        ),
      )
      .returning({ id: conversationModel.id })
    return rows.length > 0
  },

  /**
   * Switching the SLA off (or removing it) drops the snapshot of every open
   * window, so pills and the breaching/breached filters vanish with it. Reads
   * the partial index, so it only touches conversations that have a snapshot.
   */
  async clearWorkspaceSnapshots(
    props: { workspaceId: string },
    client: DatabaseClient = db,
  ): Promise<void> {
    await client
      .update(conversationModel)
      .set({
        responseDueAt: null,
        responseSlaBreachingAt: null,
        responseSlaTargetSeconds: null,
      })
      .where(
        and(
          eq(conversationModel.workspaceId, props.workspaceId),
          isNotNull(conversationModel.responseDueAt),
        ),
      )
  },
}
