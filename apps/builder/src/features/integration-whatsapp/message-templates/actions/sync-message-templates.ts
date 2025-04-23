"use server"

import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import { revalidateTag } from "next/cache"
import { getLogger } from "@/lib/log"
import { uploader } from "@ahachat.ai/filesystem"
import type { WhatsappAuthValue } from "@ahachat.ai/integration-whatsapp"
import { integrations } from "@/integration"

export const syncMessageTemplateAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams.items)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
    }) => {
      const integrationWhatsapp =
        await prisma.integrationWhatsapp.findFirstOrThrow({
          where: {
            chatbotId,
          },
        })
      const ctx = {
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
        logger: getLogger("whatsapp"),
        uploader,
      }

      const res =
        await integrations.WHATSAPP.integration.actions.listMessageTemplates({
          ctx,
          params: {
            limit: 100,
          },
        })
      await prisma.$transaction(async (tx) => {
        await tx.whatsappMessageTemplate.deleteMany({
          where: {
            integrationWhatsappId: integrationWhatsapp.id,
          },
        })
        const data = res.data.map((template) => {
          return {
            name: template.name,
            integrationWhatsappId: integrationWhatsapp.id,
            language: template.language,
            category: template.category,
            status: template.status,
            sourceId: template.id,
          }
        })
        await tx.whatsappMessageTemplate.createMany({
          data,
        })
      })

      revalidateTag(`chatbots:${chatbotId}#whatsapp#messageTemplates`)
    },
  )
