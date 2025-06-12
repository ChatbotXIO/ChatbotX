"use server"

import {
  chatbotIdRequestParams,
  type ChatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import {
  addContactTagRequest,
  type AddContactTagRequest,
} from "../schemas/add-contact-tag.request"

export const addContactTagAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .schema(addContactTagRequest)
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
      if (contacts.length === 0) return

      await prisma.$transaction(async (tx) => {
        const tags = await tx.tag.createManyAndReturn({
          data: parsedInput.tags.map((t) => ({
            name: t,
            chatbotId,
          })),
          skipDuplicates: true,
        })

        for (const contact of contacts) {
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
        }
      })

      revalidateTag(`chatbots:${chatbotId}#contacts`)
      revalidateTag(`chatbots:${chatbotId}#conversations`)
      revalidateTag(`chatbots:${chatbotId}#tags`)
    },
  )
