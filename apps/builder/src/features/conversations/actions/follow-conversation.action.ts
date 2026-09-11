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

    await conversationService.setFollowed({
      workspaceId,
      id,
      followed: true,
      userId: ctx.user.id,
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "followConversationAction",
        triggerType: "conversation_followed",
      },
    })
  })
