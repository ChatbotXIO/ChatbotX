"use server"
import { conversationService, messageService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMessageRequest } from "../schema/mutation"
export const createMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    } = props

    const conversation = await conversationService.findByOrFail({
      where: {
        id: conversationId,
        workspaceId,
      },
    })

    const contactInbox =
      await conversationService.resolveContactInboxForConversation({
        conversation,
        workspaceId,
        inboxId: parsedInput.inboxId,
      })

    return messageService.createOutgoing({
      conversation,
      contactInbox,
      input: parsedInput,
      user: ctx.user,
    })
  })
