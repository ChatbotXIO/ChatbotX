"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import { inboxModel, integrationTelegramModel } from "@aha.chat/database/schema"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const disconnectTelegramAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const integrationTelegram = await findOrFail(
        integrationTelegramModel,
        { chatbotId, id },
        "Integration Telegram not found",
      )

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationTelegramModel)
          .where(eq(integrationTelegramModel.id, integrationTelegram.id))
        await tx
          .update(inboxModel)
          .set({ status: InboxStatus.disconnected })
          .where(eq(inboxModel.id, integrationTelegram.inboxId))
      })

      revalidateCacheTags(`chatbots:${chatbotId}#telegrams`)
    },
  )
