"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import { inboxModel, integrationZaloModel } from "@aha.chat/database/schema"
import type { IntegrationZaloModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectZaloAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const integrationZalo = await findOrFail<IntegrationZaloModel>(
        integrationZaloModel,
        {
          chatbotId,
          id,
        },
        "Integration Zalo OA not found",
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
