"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { InboxStatus } from "@chatbotx.io/database/enums"
import {
  inboxModel,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { unsubscribeWebhook } from "@chatbotx.io/integration-whatsapp/api/webhook"
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
