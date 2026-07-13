"use server"

import { conversationService } from "@chatbotx.io/business"
import { findOrFail } from "@chatbotx.io/database/client"
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

  const messageRepository = await createMessageRepository()
  const last2Messages = await messageRepository.findLastByConversation(
    conversation.id,
    {
      messageTypes: ["incoming"],
      limit: 2,
      // Anchor on this conversation's own lastActivityAt, not a shared
      // ContactInbox's lastMessageAt — a contact's ContactInbox is shared
      // across their DM and every comment-thread conversation, so its
      // lastMessageAt can reflect a different, more recently active
      // conversation and push sinceTime past this conversation's real last
      // message, causing the sharded scan to miss it.
      sinceTime: getSafeSinceTime(
        conversation.lastActivityAt ?? conversation.createdAt,
        365 * 24 * 60 * 60 * 1000,
      ),
      workspaceId: ctx.workspaceId,
    },
  )
  const lastMessage = last2Messages.at(-1)

  const agentLastReadAt = lastMessage ? lastMessage.createdAt : null

  await conversationService.updateReadStatus({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    agentLastReadAt,
  })

  return { agentLastReadAt }
}
