"use server"

import { messageService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ResendMessageRequest,
  resendMessageRequest,
} from "../schema/mutation"

/** Shared by the builder action and the public route: one service call. */
export const resendMessage = async (props: {
  workspaceId: string
  conversationId: string
  parsedInput: ResendMessageRequest
}) =>
  await messageService.resendOutgoing({
    workspaceId: props.workspaceId,
    conversationId: props.conversationId,
    messageId: props.parsedInput.id,
    createdAt: props.parsedInput.createdAt,
  })

export const resendMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(resendMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props

    return await resendMessage({ workspaceId, conversationId, parsedInput })
  })
