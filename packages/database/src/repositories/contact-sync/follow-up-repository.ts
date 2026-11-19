import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from "../../client"
import {
  CONTACT_SYNC_FOLLOW_UP_ERRORS,
  CONTACT_SYNC_LIVE_STATUSES,
  type ContactSyncFollowUpError,
} from "../../partials"
import { contactSyncRunItemModel, contactSyncRunModel } from "../../schema"
import type { ContactSyncRunItemModel } from "../../types"

/** A closed item whose history sync (coexist handoff) is still owed. */
const followUpOwed = () =>
  and(
    eq(contactSyncRunItemModel.followUpCoexist, true),
    isNull(contactSyncRunItemModel.followUpRunId),
    isNull(contactSyncRunItemModel.followUpError),
    notInArray(contactSyncRunItemModel.status, ["pending", "running"]),
  )

/**
 * The history-sync follow-up of a connect-import item (see `follow-up.ts` in
 * business): asked for, owed, linked to its coexist run, failed or reopened.
 * Spread into `contactSyncRunRepository`.
 */
export const contactSyncFollowUpMethods = {
  /**
   * A second connect of a page whose item was just found open: asks that item
   * for the history sync too. It still applies when the item closed in the
   * meantime (the sweep then hands it off). The AI choice is kept when the
   * item already owed a follow-up, otherwise the new one is taken. `null` =
   * the follow-up is already linked or ended.
   */
  async requestFollowUp(
    input: { itemId: string; aiReadsSyncedHistory: boolean },
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunItemModel | null> {
    const [row] = await tx
      .update(contactSyncRunItemModel)
      .set({
        followUpAiReadsSyncedHistory: sql`CASE WHEN ${contactSyncRunItemModel.followUpCoexist}
          THEN ${contactSyncRunItemModel.followUpAiReadsSyncedHistory}
          ELSE ${input.aiReadsSyncedHistory} END`,
        followUpRequestedAt: sql`CASE WHEN ${contactSyncRunItemModel.followUpCoexist}
          THEN ${contactSyncRunItemModel.followUpRequestedAt} ELSE NOW() END`,
        followUpCoexist: true,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactSyncRunItemModel.id, input.itemId),
          isNull(contactSyncRunItemModel.followUpRunId),
          isNull(contactSyncRunItemModel.followUpError),
        ),
      )
      .returning()
    return row ?? null
  },

  /** The item row locked for the handoff, only while its follow-up is still owed. */
  async lockOwedFollowUp(
    itemId: string,
    tx: DatabaseClient,
  ): Promise<ContactSyncRunItemModel | null> {
    const [row] = await tx
      .select()
      .from(contactSyncRunItemModel)
      .where(and(eq(contactSyncRunItemModel.id, itemId), followUpOwed()))
      .for("update")
    return row ?? null
  },

  /** Closed items still owing a history sync, oldest first (the sweep). */
  listOwedFollowUps(
    input: { batchSize: number },
    tx: DatabaseClient = db,
  ): Promise<Pick<ContactSyncRunItemModel, "id" | "workspaceId">[]> {
    return tx
      .select({
        id: contactSyncRunItemModel.id,
        workspaceId: contactSyncRunItemModel.workspaceId,
      })
      .from(contactSyncRunItemModel)
      .where(followUpOwed())
      .orderBy(contactSyncRunItemModel.followUpRequestedAt)
      .limit(input.batchSize)
  },

  /**
   * Gives up on follow-ups owed for longer than `maxAgeHours`, at most
   * `batchSize` per call (after a long sweeper outage the rest follow on the
   * next sweeps). Rows another sweep holds are skipped.
   */
  async expireOwedFollowUps(
    input: { maxAgeHours: number; batchSize: number },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const overdue = tx
      .select({ id: contactSyncRunItemModel.id })
      .from(contactSyncRunItemModel)
      .where(
        and(
          followUpOwed(),
          // From when the owing item closed (a long import may take a day itself).
          sql`GREATEST(${contactSyncRunItemModel.followUpRequestedAt}, ${contactSyncRunItemModel.finishedAt}) < NOW() - make_interval(hours => ${input.maxAgeHours})`,
        ),
      )
      .limit(input.batchSize)
      .for("update", { skipLocked: true })
    const rows = await tx
      .update(contactSyncRunItemModel)
      .set({
        followUpError: CONTACT_SYNC_FOLLOW_UP_ERRORS.expired,
        updatedAt: new Date(),
      })
      .where(inArray(contactSyncRunItemModel.id, overdue))
      .returning({ id: contactSyncRunItemModel.id })
    return rows.length
  },

  /** Records the coexist run of a handoff; `false` = it was already linked. */
  async linkFollowUpRun(
    input: { itemId: string; runId: string },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const rows = await tx
      .update(contactSyncRunItemModel)
      .set({ followUpRunId: input.runId, updatedAt: new Date() })
      .where(
        and(
          eq(contactSyncRunItemModel.id, input.itemId),
          isNull(contactSyncRunItemModel.followUpRunId),
        ),
      )
      .returning({ id: contactSyncRunItemModel.id })
    return rows.length > 0
  },

  /** Ends an owed follow-up with the reason it will not happen. */
  async failFollowUp(
    input: { itemId: string; error: ContactSyncFollowUpError },
    tx: DatabaseClient = db,
  ): Promise<void> {
    await tx
      .update(contactSyncRunItemModel)
      .set({ followUpError: input.error, updatedAt: new Date() })
      .where(and(eq(contactSyncRunItemModel.id, input.itemId), followUpOwed()))
  },

  /**
   * Retry-history: re-opens the follow-up of the page's latest closed item
   * whose handoff failed and restarts its 24 h window. Older items (superseded,
   * expired, cancelled) stay closed. The caller checked the inbox is connected.
   */
  async reopenFollowUp(
    input: { workspaceId: string; inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(contactSyncRunItemModel)
      .set({
        followUpError: null,
        followUpRequestedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(
            contactSyncRunItemModel.id,
            sql`(SELECT i.id FROM "ContactSyncRunItem" i
              WHERE i."workspaceId" = ${input.workspaceId}
                AND i."inboxId" = ${input.inboxId}
                AND i."followUpCoexist"
                AND i.status NOT IN ('pending', 'running')
              ORDER BY i."createdAt" DESC, i.id DESC LIMIT 1)`,
          ),
          isNull(contactSyncRunItemModel.followUpRunId),
          isNotNull(contactSyncRunItemModel.followUpError),
        ),
      )
      .returning({ id: contactSyncRunItemModel.id })
    return rows.length
  },

  /**
   * The workspace's still-open item (pending or running, in a live run) for an
   * inbox, if any: what a second connect reuses, and what keeps the same
   * page's history sync from starting while its contacts are importing.
   */
  async findOpenItemForInbox(
    input: { workspaceId: string; inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<ContactSyncRunItemModel | null> {
    const [row] = await tx
      .select({ item: contactSyncRunItemModel })
      .from(contactSyncRunItemModel)
      .innerJoin(
        contactSyncRunModel,
        eq(contactSyncRunItemModel.runId, contactSyncRunModel.id),
      )
      .where(
        and(
          eq(contactSyncRunItemModel.workspaceId, input.workspaceId),
          eq(contactSyncRunItemModel.inboxId, input.inboxId),
          inArray(contactSyncRunItemModel.status, ["pending", "running"]),
          inArray(contactSyncRunModel.status, CONTACT_SYNC_LIVE_STATUSES),
        ),
      )
      .limit(1)
    return row?.item ?? null
  },

  /**
   * Per-item cancellation when a page goes away (disconnect, inbox removal):
   * the inbox's open items end `cancelled` and every owed follow-up is marked
   * `cancelled`, so a later reconnect never starts a history sync the user
   * did not ask for. The run itself goes on with its other items.
   */
  async cancelForInbox(
    input: { workspaceId: string; inboxId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const rows = await tx
      .update(contactSyncRunItemModel)
      .set({
        status: sql`CASE WHEN ${contactSyncRunItemModel.status} IN ('pending', 'running')
          THEN 'cancelled'::"contactSyncRunItemStatus" ELSE ${contactSyncRunItemModel.status} END`,
        finishedAt: sql`COALESCE(${contactSyncRunItemModel.finishedAt}, NOW())`,
        followUpError: sql`CASE WHEN ${contactSyncRunItemModel.followUpCoexist}
            AND ${contactSyncRunItemModel.followUpRunId} IS NULL
            AND ${contactSyncRunItemModel.followUpError} IS NULL
          THEN ${CONTACT_SYNC_FOLLOW_UP_ERRORS.cancelled} ELSE ${contactSyncRunItemModel.followUpError} END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactSyncRunItemModel.workspaceId, input.workspaceId),
          eq(contactSyncRunItemModel.inboxId, input.inboxId),
          or(
            inArray(contactSyncRunItemModel.status, ["pending", "running"]),
            followUpOwed(),
          ),
        ),
      )
      .returning({ id: contactSyncRunItemModel.id })
    return rows.length
  },
}
