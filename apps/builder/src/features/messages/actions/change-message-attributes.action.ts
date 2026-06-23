"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, findOrFail } from "@chatbotx.io/database/client"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { conversationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ChatJobAction, chatQueue } from "@chatbotx.io/worker-config"
import { workspaceActionClient } from "@/lib/safe-action"
import { changeMessageAttributesRequest } from "../schema/mutation"

export const changeMessageAttributesAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(changeMessageAttributesRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput: { messageId, createdAt, liked, hidden },
    } = props

    const conversation = await findOrFail({
      table: conversationModel,
      where: { id: conversationId, workspaceId },
      message: "Conversation not found",
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

    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: { id: message.contactInboxId },
    })
    if (!contactInbox) {
      throw new ChatbotXException("Inbox not found")
    }

    const current =
      (message.attributes as { liked?: boolean; hidden?: boolean } | null) ?? {}
    const newAttributes = {
      liked: liked === undefined ? (current.liked ?? false) : liked,
      hidden: hidden === undefined ? (current.hidden ?? false) : hidden,
    }

    await repository.updateMessageAttributes(
      messageId,
      workspaceId,
      newAttributes,
      message.createdAt,
    )

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

    return { success: true, messageId, attributes: newAttributes }
  })
