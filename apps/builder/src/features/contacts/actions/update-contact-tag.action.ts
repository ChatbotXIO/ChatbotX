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
      const contact = await prisma.contact.findFirstOrThrow({
        where: {
          id: parsedInput.contactId,
        },
      })

      const returnedTags = await prisma.$transaction(async (tx) => {
        const tags = await tx.tag.createManyAndReturn({
          data: parsedInput.tags.map((t) => ({
            name: t,
            chatbotId,
          })),
          skipDuplicates: true,
        })

        await tx.contact.update({
          data: {
            tags: {
              connect: tags.map((t) => ({ id: t.id })),
            },
          },
          where: {
            id: contact.id,
          },
        })

        return tags
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
        `chatbots:${chatbotId}#tags`,
      ])

      return returnedTags
    },
  )
