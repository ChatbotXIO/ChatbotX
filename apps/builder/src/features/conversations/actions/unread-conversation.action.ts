"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const unreadConversationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    return await unreadConversation({ workspaceId, id })
  })

export const unreadConversation = async (ctx: {
  workspaceId: string
  id: string
}) => {
  return await db.transaction(async (tx) => {
    const conversation = await findOrFail({
      table: conversationModel,
      where: { id: ctx.id, workspaceId: ctx.workspaceId },
      message: "Conversation not found",
    })

    const last2Messages = await tx.query.messageModel.findMany({
      where: {
        conversationId: conversation.id,
        messageType: "incoming",
      },
      orderBy: { createdAt: "desc" },
      limit: 2,
    })
    const lastMessage = last2Messages.at(-1)

    const agentLastReadAt = lastMessage ? lastMessage.createdAt : null

    await tx
      .update(conversationModel)
      .set({
        agentLastReadAt,
      })
      .where(eq(conversationModel.id, ctx.id))

    return { agentLastReadAt }
  })
}
