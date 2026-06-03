"use server"

import { conversationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const unfollowConversationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await unfollowConversation({ workspaceId, id })
  })

export const unfollowConversation = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const conversation = await conversationService.findByOrFail({
    where: { id: ctx.id, workspaceId: ctx.workspaceId },
  })

  await conversationService.updateFollowed({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    contactId: conversation.contactId,
    followed: false,
    triggerContext: {
      triggerSource: "api",
      triggerHandler: "unfollowConversationAction",
      triggerType: "conversation_unfollowed",
    },
  })
}
