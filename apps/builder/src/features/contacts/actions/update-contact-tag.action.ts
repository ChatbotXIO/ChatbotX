"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateContactTagRequest,
  updateContactTagRequest,
} from "../schemas/contact-tag"

export const updateContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateContactTagRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateContactTagRequest
    }) => {
      await prisma.contact.findFirstOrThrow({
        where: {
          id: parsedInput.contactId,
        },
      })

      const tagConnections = await Promise.all(
        parsedInput.tags.map(async (tagName) => {
          const existingTag = await prisma.tag.findFirst({
            where: {
              name: tagName,
              chatbotId,
            },
          })

          if (existingTag) {
            return { id: existingTag.id }
          }

          const newTag = await prisma.tag.create({
            data: {
              name: tagName,
              chatbotId,
              syncToMessenger: false,
            },
          })

          return { id: newTag.id }
        }),
      )

      const updatedContact = await prisma.contact.update({
        where: { id: parsedInput.contactId },
        data: {
          tags: {
            set: tagConnections,
          },
        },
        include: {
          tags: true,
        },
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#tags`,
      ])

      return updatedContact
    },
  )
