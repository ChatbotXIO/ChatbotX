"use server"

import { prisma } from "@aha.chat/database"
import { IntegrationJobAction, integrationQueue } from "@aha.chat/worker-config"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const blockContactAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      await prisma.contact.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      const contact = await prisma.contact.update({
        where: {
          id,
        },
        data: {
          blockedAt: new Date(),
        },
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
      ])

      await integrationQueue.add(IntegrationJobAction.blockContact, {
        type: IntegrationJobAction.blockContact,
        data: {
          contact,
        },
      })
    },
  )
