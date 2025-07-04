"use server"

import {
  chatbotIdRequestParams,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  removeContactTagRequest,
  type RemoveContactTagRequest,
} from "../schemas/remove-contact-tag.request"

export const removeContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .inputSchema(removeContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: RemoveContactTagRequest
    }) => {
      const contacts = await prisma.contact.findMany({
        where: {
          chatbotId,
          id: {
            in: parsedInput.ids,
          },
        },
        select: {
          id: true,
        },
      })
      if (contacts.length === 0) return

      await prisma.$transaction(async (tx) => {
        for (const contact of contacts) {
          await tx.contact.update({
            data: {
              tags: {
                disconnect: {
                  id: parsedInput.tagId,
                },
              },
            },
            where: {
              id: contact.id,
            },
          })
        }
      })

      revalidateTag(`chatbots:${chatbotId}#contacts`)
      revalidateTag(`chatbots:${chatbotId}#conversations`)
      revalidateTag(`chatbots:${chatbotId}#tags`)
    },
  )
