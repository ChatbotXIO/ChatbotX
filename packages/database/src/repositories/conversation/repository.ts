import { and, type DatabaseClient, db, eq, isNull } from "../../client"
import { conversationModel } from "../../schema"
import type { ConversationModel } from "../../types"

/**
 * Claims an unassigned conversation for a user — used by the call-answer and
 * outbound-dial auto-assign flows (P3). The `IS NULL` guards on both
 * `assignedUserId` AND `assignedInboxTeamId` are the whole guarantee: a
 * conversation already assigned to a user OR a team is left untouched, so a
 * concurrent manual assignment always wins and a team-assigned conversation
 * is never silently reassigned to the answering/dialing agent (plan D2).
 * `.returning()` empty means the guard didn't match — the caller must treat
 * that as "did not claim", not retry or error.
 */
export async function assignUserIfUnassigned(
  params: {
    workspaceId: string
    conversationId: string
    userId: string
  },
  tx: DatabaseClient = db,
): Promise<ConversationModel[]> {
  const { workspaceId, conversationId, userId } = params
  return await tx
    .update(conversationModel)
    .set({ assignedUserId: userId })
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
