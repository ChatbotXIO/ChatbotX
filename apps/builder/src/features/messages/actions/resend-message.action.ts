"use server"

import { messageService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { resendMessageRequest } from "../schema/mutation"

export const resendMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(resendMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props

    return await messageService.resendOutgoing({
      workspaceId,
      conversationId,
      messageId: parsedInput.id,
      createdAt: parsedInput.createdAt,
    })
  })
