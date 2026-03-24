"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import {
  inboxModel,
  integrationInstagramModel,
} from "@aha.chat/database/schema"
import type { IntegrationInstagramModel } from "@aha.chat/database/types"
import type { InstagramAuthValue } from "@aha.chat/integration-instagram"
import { unsubscribePageFromInstagramWebhook } from "@aha.chat/integration-instagram/apis/page"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectInstagramAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, integrationInstagramId],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const integrationInstagram = await findOrFail<IntegrationInstagramModel>(
        integrationInstagramModel,
        {
          id: integrationInstagramId,
          chatbotId,
        },
        "Integration Instagram not found",
      )

      await db.transaction(async (tx) => {
        const authValue = integrationInstagram.auth as InstagramAuthValue
        await unsubscribePageFromInstagramWebhook({
          pageId: integrationInstagram.pageId,
          accessToken: authValue.tokens.accessToken as string,
          version: authValue.metadata.version,
        })

        await tx
          .delete(integrationInstagramModel)
          .where(eq(integrationInstagramModel.id, integrationInstagram.id))

        await tx
          .update(inboxModel)
          .set({ status: InboxStatus.disconnected })
          .where(eq(inboxModel.id, integrationInstagram.inboxId))
      })

      revalidateCacheTags([
        `chatbots:${chatbotId}#instagram`,
        `chatbots:${chatbotId}#inboxes`,
      ])
    },
  )
