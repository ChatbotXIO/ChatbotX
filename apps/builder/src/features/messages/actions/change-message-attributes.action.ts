"use server"

import { contactInboxService, conversationService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type ChangeMessageAttributesRequest,
  changeMessageAttributesRequest,
} from "../schema/mutation"

export const changeMessageAttributes = async (props: {
  workspaceId: string
  conversationId: string
  parsedInput: ChangeMessageAttributesRequest
}) => {
  const { workspaceId, conversationId, parsedInput } = props
  const { messageId, createdAt, liked, hidden } = parsedInput

  const conversation = await conversationService.findByOrFail({
    where: { id: conversationId, workspaceId },
  })

  const repository = await createMessageRepository()
  const message = await repository.findById({
    id: messageId,
    createdAt,
    workspaceId,
  })
  if (!message) {
    throw new ChatbotXException("Message not found")
  }

  const contactInbox = await contactInboxService.findBy({
    where: { id: message.contactInboxId },
  })
  if (!contactInbox) {
    throw new ChatbotXException("Inbox not found")
  }

  await Promise.allSettled([
    chatQueue.add(ChatJobAction.changeChannelMessageState, {
      type: ChatJobAction.changeChannelMessageState,
      data: {
        conversation,
        contactInbox,
        message: { id: messageId, createdAt: message.createdAt },
        liked,
        hidden,
      },
    }),
  ])

  return { success: true, messageId }
}

export const changeMessageAttributesAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(changeMessageAttributesRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
    } = props

    return await changeMessageAttributes({
      workspaceId,
      conversationId,
      parsedInput,
    })
  })
