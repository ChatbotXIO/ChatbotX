"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { InboxStatus } from "@aha.chat/database/enums"
import { inboxModel, integrationWhatsappModel } from "@aha.chat/database/schema"
import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { unsubscribeWebhook } from "@aha.chat/integration-whatsapp/api/webhook"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"

export const disconnectWhatsappAction = authActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const integrationWhatsapp = await findOrFail<IntegrationWhatsappModel>(
        integrationWhatsappModel,
        {
          chatbotId,
          id,
        },
        "Integration Whatsapp not found",
      )

      await unsubscribeWebhook({
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
      })

      await db.transaction(async (tx) => {
        await tx
          .delete(integrationWhatsappModel)
          .where(eq(integrationWhatsappModel.id, integrationWhatsapp.id))

        await tx
          .update(inboxModel)
          .set({ status: InboxStatus.disconnected })
          .where(eq(inboxModel.id, integrationWhatsapp.inboxId))
      })

      revalidateCacheTags(`chatbots:${chatbotId}#inboxes`)
    },
  )
