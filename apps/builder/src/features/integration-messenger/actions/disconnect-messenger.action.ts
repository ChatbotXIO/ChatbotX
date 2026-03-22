"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import {
  inboxModel,
  integrationMessengerModel,
} from "@aha.chat/database/schema"
import type { IntegrationMessengerModel } from "@aha.chat/database/types"
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
      const integrationMessenger = await findOrFail<IntegrationMessengerModel>(
        integrationMessengerModel,
        {
          chatbotId,
        },
        "Integration Messenger not found",
      )

      await db.transaction(async (tx) => {
        // Unsubscribe from app
        const authValue = integrationMessenger.auth as MessengerAuthValue
        await unsubscribePageFromAppWebhook({
          pageId: integrationMessenger.pageId,
          accessToken: authValue.tokens.accessToken as string,
          version: authValue.metadata.version,
        })

        await tx
          .delete(integrationMessengerModel)
          .where(eq(integrationMessengerModel.id, integrationMessenger.id))

        await tx
          .update(inboxModel)
          .set({ status: InboxStatus.disconnected })
          .where(eq(inboxModel.id, integrationMessenger.inboxId))
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#messenger`,
        `chatbots:${chatbotId}#inboxes`,
      ])
    },
  )
