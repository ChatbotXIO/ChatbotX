"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type RemoveContactTagRequest,
  removeContactTagRequest,
} from "../schemas/remove-contact-tag.request"

export const removeContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
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
      if (contacts.length === 0) {
        return
      }

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

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#tags`,
      ])
    },
  )
