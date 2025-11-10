"use server"

import { prisma } from "@aha.chat/database"
import { revalidateTag } from "next/cache"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateContactRequest,
  createContactSchema,
} from "../schemas/create-contact-schema"

export const createContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createContactSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateContactRequest
    }) => {
      const existedContact = await prisma.contact.findFirst({
        where: {
          chatbotId,
          phoneNumber: parsedInput.phoneNumber,
        },
      })
      if (existedContact) {
        return returnValidationErrors(createContactSchema, {
          _errors: ["Validation Exception"],
          phoneNumber: {
            _errors: ["Phone number is exists"],
          },
        })
      }

      const inbox = await prisma.inbox.findFirstOrThrow({
        where: {
          chatbotId,
        },
        orderBy: {
          createdAt: "asc",
        },
      })

      const chatbotUsage = await prisma.chatbotUsage.findFirstOrThrow({
        where: { chatbotId },
      })
      if (chatbotUsage.contactsCount >= chatbotUsage.maxContacts) {
        return returnValidationErrors(createContactSchema, {
          _errors: ["Validation Exception"],
          phoneNumber: {
            _errors: ["Max contacts reached"],
          },
        })
      }

      await prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
          data: { ...parsedInput, chatbotId, source: "whatsapp" },
        })

        await tx.chatbotUsage.update({
          where: { chatbotId },
          data: {
            contactsCount: {
              increment: 1,
            },
          },
        })

        await tx.conversation.create({
          data: {
            chatbotId,
            contactId: contact.id,
            inboxId: inbox.id,
          },
        })
      })

      revalidateTag(`chatbots:${chatbotId}#contacts`)
      revalidateTag(`chatbots:${chatbotId}#conversations`)
    },
  )
