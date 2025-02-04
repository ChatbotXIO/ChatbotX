"use server"

import { authActionClient } from "@/lib/safe-action"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type User, prisma } from "@ahachat.ai/database"
import { returnValidationErrors } from "next-safe-action"
import { revalidateTag } from "next/cache"
import {
  type CreateContactBindSchema,
  type CreateContactSchema,
  createContactBindSchema,
  createContactSchema,
} from "../schemas/create-contact-schema"

export const createContactAction = authActionClient
  .schema(createContactSchema)
  .bindArgsSchemas(createContactBindSchema)
  .action(
    async ({
      ctx,
      parsedInput,
      bindArgsParsedInputs: [chatbotId],
    }: {
      ctx: { user: User }
      parsedInput: CreateContactSchema
      bindArgsParsedInputs: CreateContactBindSchema
    }) => {
      const { chatbot } = await findChatbotOrFail(ctx.user.id, chatbotId)

      const existedContact = await prisma.contact.findFirst({
        where: { chatbotId: chatbot.id, phoneNumber: parsedInput.phoneNumber },
      })
      if (existedContact) {
        return returnValidationErrors(createContactSchema, {
          _errors: ["Validation Exception"],
          phoneNumber: {
            _errors: ["Phone number is exists"],
          },
        })
      }

      await prisma.$transaction(async (tx) => {
        const contact = await tx.contact.create({
          data: { ...parsedInput, chatbotId: chatbot.id, source: "whatsapp" },
        })

        await tx.conversation.create({
          data: {
            chatbotId: chatbot.id,
            contactId: contact.id,
          },
        })
      })

      revalidateTag(`u${ctx.user.id}#c${chatbotId}#contacts`)
      revalidateTag(`u${ctx.user.id}#c${chatbotId}#conversations`)

      return {
        successful: true,
      }
    },
  )
