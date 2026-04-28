"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
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
  const conversation = await findOrFail({
    table: conversationModel,
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
    message: "Conversation not found",
  })

  const contactInbox = await db.query.contactInboxModel.findFirst({
    where: { contactId: conversation.contactId },
    orderBy: { lastMessageAt: "desc" },
  })

  const messageRepository = await createMessageRepository()
  const last2Messages = await messageRepository.findLastByConversation(
    conversation.id,
    {
      messageTypes: ["incoming"],
      limit: 2,
      sinceTime: getSafeSinceTime(
        contactInbox?.lastMessageAt,
        365 * 24 * 60 * 60 * 1000, // 1 year
      ),
    },
  )
  const lastMessage = last2Messages.at(-1)

  const agentLastReadAt = lastMessage ? lastMessage.createdAt : null

  await db
    .update(conversationModel)
    .set({
      agentLastReadAt,
    })
    .where(eq(conversationModel.id, ctx.id))

  return { agentLastReadAt }
}
