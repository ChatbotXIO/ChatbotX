"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type AddContactTagRequest,
  addContactTagRequest,
} from "../schemas/contact-tag"

export const addContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(addContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: AddContactTagRequest
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
        // Create new tags if they don't exist
        await tx.tag.createMany({
          data: parsedInput.tags.map((t) => ({
            name: t,
            chatbotId,
          })),
          skipDuplicates: true,
        })

        const allTags = await tx.tag.findMany({
          where: {
            chatbotId,
            name: { in: parsedInput.tags },
          },
          select: {
            id: true,
          },
        })

        for (const contact of contacts) {
          await tx.contact.update({
            data: {
              tags: {
                connect: allTags,
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
