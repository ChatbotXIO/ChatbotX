"use server"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import { revalidateTag } from "next/cache"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { chatbotActionClient } from "@/lib/safe-action"

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
        uploader,
      }

      const res = await integrations.WHATSAPP.actions.listMessageTemplates({
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
