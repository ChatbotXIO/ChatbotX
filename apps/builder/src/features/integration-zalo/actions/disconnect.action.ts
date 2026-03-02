"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import { inboxModel, integrationZaloModel } from "@aha.chat/database/schema"
import type { IntegrationZaloModel } from "@aha.chat/database/types"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectZaloAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationZalo = await findOrFail<IntegrationZaloModel>(
        integrationZaloModel,
        {
          chatbotId,
        },
        "Integration Zalo not found",
      )

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationZaloModel)
          .where(eq(integrationZaloModel.id, integrationZalo.id))
        await tx
          .update(inboxModel)
          .set({ status: InboxStatus.disconnected })
          .where(eq(inboxModel.id, integrationZalo.inboxId))
      })

      revalidateCacheTags(`chatbots:${chatbotId}#zalos`)
    },
  )
