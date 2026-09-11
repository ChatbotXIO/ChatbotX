"use server"

import { conversationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const unfollowConversationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      ctx,
    } = props

    await conversationService.setFollowed({
      workspaceId,
      id,
      followed: false,
      userId: ctx.user.id,
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "unfollowConversationAction",
        triggerType: "conversation_unfollowed",
      },
    })
  })
