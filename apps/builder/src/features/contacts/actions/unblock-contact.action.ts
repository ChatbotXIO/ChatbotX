"use server"

import { prisma } from "@aha.chat/database"
import {
  broadcastToChatbotParty,
  RealtimeEventType,
} from "@aha.chat/partysocket-config"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const unblockContactAction = chatbotActionClient
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

      await prisma.contact.update({
        where: {
          id,
        },
        data: {
          blockedAt: null,
        },
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#contacts`,
        `chatbots:${chatbotId}#conversations`,
      ])

      await broadcastToChatbotParty(chatbotId, {
        eventType: RealtimeEventType.contactUnblocked,
        data: {
          contactId: id,
        },
      })
    },
  )
