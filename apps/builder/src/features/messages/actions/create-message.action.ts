"use server"
import {
  contactInboxService,
  conversationService,
  messageService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
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

    const contactInbox = parsedInput.inboxId
      ? await contactInboxService.findBy({
          where: {
            contactId: conversation.contactId,
            inboxId: parsedInput.inboxId,
          },
        })
      : await contactInboxService.findRecentByContactId({
          workspaceId,
          contactId: conversation.contactId,
        })
    if (!contactInbox) {
      throw new ChatbotXException("Inbox not found")
    }

    return messageService.createOutgoing({
      conversation,
      contactInbox,
      input: parsedInput,
      user: ctx.user,
    })
  })
