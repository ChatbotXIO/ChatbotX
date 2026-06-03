"use server"

import { conversationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const followConversationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      ctx,
    } = props

    await followConversation({ workspaceId, id, userId: ctx.user.id })
  })

export const followConversation = async (ctx: {
  workspaceId: string
  id: string
  userId: string
}) => {
  const conversation = await conversationService.findByOrFail({
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
  })

  await conversationService.updateFollowed({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    contactId: conversation.contactId,
    followed: true,
    userId: ctx.userId,
    triggerContext: {
      triggerSource: "api",
      triggerHandler: "followConversationAction",
      triggerType: "conversation_followed",
    },
  })
}
