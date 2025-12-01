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
} from "../schemas/add-contact-tag.request"

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

      const existingTags = await prisma.tag.findMany({
        where: {
          chatbotId,
          name: { in: parsedInput.tags },
        },
      })
      const existingTagNames = new Set(existingTags.map((tag) => tag.name))
      const newTagNames = parsedInput.tags.filter(
        (name) => !existingTagNames.has(name),
      )

      await prisma.$transaction(async (tx) => {
        let createdTags: typeof existingTags = []
        if (newTagNames.length > 0) {
          createdTags = await tx.tag.createManyAndReturn({
            data: newTagNames.map((name) => ({
              name,
              chatbotId,
            })),
            skipDuplicates: true,
          })
        }

        const allTags = [...existingTags, ...createdTags]
        await prisma.$transaction(async () => {
          for (const contact of contacts) {
            await tx.contact.update({
              data: {
                tags: {
                  connect: allTags.map((tag) => ({ id: tag.id })),
                },
              },
              where: {
                id: contact.id,
              },
            })
          }
        })
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#tags`,
      ])
    },
  )
