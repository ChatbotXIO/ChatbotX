"use server"

import { prisma } from "@aha.chat/database"
import { InboxStatus } from "@aha.chat/database/enums"
import type { MessengerAuthValue } from "@aha.chat/integration-messenger"
import { unsubscribePageFromAppWebhook } from "@aha.chat/integration-messenger/apis/page"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectMessengerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationMessenger =
        await prisma.integrationMessenger.findFirstOrThrow({
          where: { chatbotId },
        })

      await prisma.$transaction(async (tx) => {
        // Unsubscribe from app
        const authValue = integrationMessenger.auth as MessengerAuthValue
        await unsubscribePageFromAppWebhook({
          pageId: integrationMessenger.pageId,
          accessToken: authValue.tokens.accessToken as string,
          version: authValue.metadata.version,
        })

        await tx.integrationMessenger.delete({
          where: { id: integrationMessenger.id },
        })
        await tx.inbox.update({
          where: { id: integrationMessenger.inboxId },
          data: { status: InboxStatus.disconnected },
        })
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#messenger`,
        `chatbots:${chatbotId}#inboxes`,
      ])
    },
  )
