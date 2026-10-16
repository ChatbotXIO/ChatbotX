import { and, type DatabaseClient, db, eq, isNull } from "../../client"
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

export async function assignTargetIfUnassigned(
  params: {
    assignedInboxTeamId?: string | null
    assignedUserId?: string | null
    conversationId: string
    workspaceId: string
  },
  tx: DatabaseClient = db,
): Promise<ConversationModel[]> {
  return await tx
    .update(conversationModel)
    .set({
      assignedInboxTeamId: params.assignedInboxTeamId ?? null,
      assignedUserId: params.assignedUserId ?? null,
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
