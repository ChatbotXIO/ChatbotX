"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { returnValidationErrors } from "next-safe-action"
import { revalidateTag } from "next/cache"
import {
  type CreateContactRequest,
  createContactSchema,
} from "../schemas/create-contact-schema"

export const createContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(createContactSchema)
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

      await prisma.contact.create({
        data: {
          ...parsedInput,
          chatbotId,
          source: "web",
        },
      })

      revalidateTag(`chatbot:${chatbotId}#contacts`)
    },
  )
