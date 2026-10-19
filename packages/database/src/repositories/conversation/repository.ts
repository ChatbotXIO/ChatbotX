import { and, type DatabaseClient, db, eq, isNull, sql } from "../../client"
import { conversationModel } from "../../schema"
import type { ConversationModel } from "../../types"

/**
 * Claims an unassigned conversation for a user — used by the call-answer and
 * outbound-dial auto-assign flows. The `IS NULL` guards on both `assignedUserId`
 * AND `assignedInboxTeamId` ensure a concurrent manual assignment always wins.
 * An empty `.returning()` means the guard didn't match — treat as "did not
 * claim", not retry or error.
 */
export async function assignUserIfUnassigned(
  params: {
    workspaceId: string
    conversationId: string
    userId: string
    /** Instant recorded as `assignedUserAt`; defaults to now. */
    assignedAt?: Date
  },
  tx: DatabaseClient = db,
): Promise<ConversationModel[]> {
  const { workspaceId, conversationId, userId } = params
  return await tx
    .update(conversationModel)
    .set({
      assignedUserId: userId,
      assignedUserAt: params.assignedAt ?? new Date(),
    })
    .where(
      and(
        eq(conversationModel.workspaceId, workspaceId),
        eq(conversationModel.id, conversationId),
        isNull(conversationModel.assignedUserId),
        isNull(conversationModel.assignedInboxTeamId),
      ),
    )
    .returning()
}

export async function assignTargetIfUnassigned(
  params: {
    assignedInboxTeamId?: string | null
    assignedUserId?: string | null
    conversationId: string
    workspaceId: string
    /** Instant recorded as `assignedUserAt` (only when a user is set); defaults to now. */
    assignedAt?: Date
  },
  tx: DatabaseClient = db,
): Promise<ConversationModel[]> {
  return await tx
    .update(conversationModel)
    .set({
      assignedInboxTeamId: params.assignedInboxTeamId ?? null,
      assignedUserId: params.assignedUserId ?? null,
      // A team-only assignment never moves the measurement start.
      ...(params.assignedUserId
        ? { assignedUserAt: params.assignedAt ?? new Date() }
        : {}),
    })
    .where(
      and(
        eq(conversationModel.workspaceId, params.workspaceId),
        eq(conversationModel.id, params.conversationId),
        isNull(conversationModel.assignedUserId),
        isNull(conversationModel.assignedInboxTeamId),
      ),
    )
    .returning()
}

export type CloseHumanReplyWindowResult = {
  /** Start of the window this statement closed, or `null` when none was closed. */
  closedAwaitingSince: Date | null
  previousAdminRepliedAt: Date | null
  assignedUserId: string | null
  assignedUserAt: Date | null
}

type CloseHumanReplyWindowRow = {
  closedAwaitingSince: string | Date | null
  previousAdminRepliedAt: string | Date | null
  assignedUserId: string | null
  assignedUserAt: string | Date | null
}

const toDateOrNull = (value: string | Date | null): Date | null =>
  value === null ? null : new Date(value)

/**
 * Records a human reply and closes the DM waiting window in one serialized
 * claim. `FOR NO KEY UPDATE` (only non-key columns change, so child-row FK key-share locks are not blocked) makes a concurrent second reply re-read the row after the
 * first commits, so only one of two concurrent replies receives the closed
 * window's start (the other gets `closedAwaitingSince: null`). A window opened
 * after `repliedAt` (`since > repliedAt`) is left open. Returns `null` when the
 * conversation is not in the workspace.
 */
export async function closeHumanReplyWindow(
  params: { workspaceId: string; conversationId: string; repliedAt: Date },
  tx: DatabaseClient = db,
): Promise<CloseHumanReplyWindowResult | null> {
  const repliedAt = params.repliedAt.toISOString()
  const result = await tx.execute<CloseHumanReplyWindowRow>(sql`
    WITH old AS (
      SELECT id, "awaitingHumanReplySince", "adminRepliedAt", "assignedUserId", "assignedUserAt"
      FROM "Conversation"
      WHERE id = ${params.conversationId} AND "workspaceId" = ${params.workspaceId}
      FOR NO KEY UPDATE
    )
    UPDATE "Conversation" c
    SET "adminRepliedAt" = ${repliedAt}::timestamptz,
        "agentLastReadAt" = ${repliedAt}::timestamptz,
        "lastActivityAt" = ${repliedAt}::timestamptz,
        "awaitingHumanReplySince" = CASE
          WHEN old."awaitingHumanReplySince" IS NOT NULL
            AND old."awaitingHumanReplySince" <= ${repliedAt}::timestamptz THEN NULL
          ELSE old."awaitingHumanReplySince" END,
        "awaitingHumanReplyClosedAt" = GREATEST(
          COALESCE(c."awaitingHumanReplyClosedAt", '-infinity'::timestamptz),
          ${repliedAt}::timestamptz)
    FROM old
    WHERE c.id = old.id
    RETURNING
      (CASE WHEN old."awaitingHumanReplySince" IS NOT NULL
        AND old."awaitingHumanReplySince" <= ${repliedAt}::timestamptz
        THEN old."awaitingHumanReplySince" END) AS "closedAwaitingSince",
      old."adminRepliedAt" AS "previousAdminRepliedAt",
      old."assignedUserId" AS "assignedUserId",
      old."assignedUserAt" AS "assignedUserAt"
  `)
  const row = result.rows[0]
  if (!row) {
    return null
  }
  return {
    closedAwaitingSince: toDateOrNull(row.closedAwaitingSince),
    previousAdminRepliedAt: toDateOrNull(row.previousAdminRepliedAt),
    assignedUserId: row.assignedUserId,
    assignedUserAt: toDateOrNull(row.assignedUserAt),
  }
}
