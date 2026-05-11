"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, findOrFail } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { createMessageRequest } from "../schema/mutation"
import { createMessage } from "./create-message.service"

export const createMessageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createMessageRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, conversationId],
      parsedInput,
      ctx,
    } = props

    const conversation = await findOrFail({
      table: conversationModel,
      where: {
        id: conversationId,
        workspaceId,
      },
      message: "Conversation not found",
    })

    // Find target contact inbox, or fallback to latest interactive contactInbox
    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: {
        contactId: conversation.contactId,
        inboxId: parsedInput.inboxId ? parsedInput.inboxId : undefined,
      },
      orderBy: {
        lastMessageAt: "desc",
      },
    })
    if (!contactInbox) {
      throw new ChatbotXException("Inbox not found")
    }

    return createMessage({
      conversation,
      contactInbox,
      parsedInput,
      user: ctx.user,
    })
  })
