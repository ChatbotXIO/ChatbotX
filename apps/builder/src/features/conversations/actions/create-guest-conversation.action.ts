import { Gender, InboxType, prisma } from "@aha.chat/database"
import { randomString } from "remeda"
import { BaseException } from "@/lib/error"
import { actionClient } from "@/lib/safe-action"
import { createGuestConversationSchema } from "../schemas/create-guest-conversation.schema"

export const createGuestConversationAction = actionClient
  .inputSchema(createGuestConversationSchema)
  .action(async ({ parsedInput }) => {
    const inbox = await prisma.inbox.findFirst({
      where: {
        chatbotId: parsedInput.chatbotId,
        inboxType: InboxType.CHAT_WIDGET,
      },
    })
    if (!inbox) {
      throw new BaseException("Inbox not found")
    }

    let conversation = await prisma.conversation.findFirst({
      where: {
        chatbotId: parsedInput.chatbotId,
        sourceId: parsedInput.guestConversationId,
        inboxId: inbox.id,
      },
    })
    if (!conversation) {
      // find or create contact
      let contact = await prisma.contact.findFirst({
        where: {
          chatbotId: parsedInput.chatbotId,
          sourceId: parsedInput.guestConversationId,
        },
      })
      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            chatbotId: parsedInput.chatbotId,
            sourceId: parsedInput.guestConversationId,
            email: parsedInput.guestConversationId,
            source: InboxType.CHAT_WIDGET,
            gender: Gender.UNKNOWN,
            firstName: "Guest",
            lastName: randomString(10),
          },
        })
      }

      conversation = await prisma.conversation.create({
        data: {
          chatbotId: parsedInput.chatbotId,
          sourceId: parsedInput.guestConversationId,
          inboxId: inbox.id,
          contactId: contact.id,
        },
      })
    }

    return conversation
  })
