"use server"

import { prisma } from "@aha.chat/database"
import { InboxStatus } from "@aha.chat/database/enums"
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
      const integrationWhatsapp =
        await prisma.integrationWhatsapp.findFirstOrThrow({
          where: {
            chatbotId,
            id,
          },
        })

      await unsubscribeWebhook({
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
      })

      await prisma.$transaction(async (tx) => {
        await tx.integrationWhatsapp.delete({
          where: { id: integrationWhatsapp.id },
        })
        await tx.inbox.update({
          where: { id: integrationWhatsapp.inboxId },
          data: { status: InboxStatus.disconnected },
        })
      })

      revalidateCacheTags(`chatbots:${chatbotId}#inboxes`)

      return
    },
  )
