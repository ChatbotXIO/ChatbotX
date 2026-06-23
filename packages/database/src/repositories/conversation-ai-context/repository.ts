import { type DatabaseClient, db } from "../../client"

export type ConversationAIContextState = {
  aiContextLastMessageId: string | null
  lastActivityAt: Date | null
}

export async function findConversationAIContextState(
  params: {
    conversationId: string
    workspaceId: string
  },
  client: DatabaseClient = db,
): Promise<ConversationAIContextState | null> {
  const conversation = await client.query.conversationModel.findFirst({
    where: {
      id: params.conversationId,
      workspaceId: params.workspaceId,
    },
    columns: {
      aiContextLastMessageId: true,
      lastActivityAt: true,
    },
  })

  return conversation ?? null
}
