"use server"

import { prisma } from "@aha.chat/database"
import { uploader } from "@aha.chat/filesystem"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { integrations } from "@/integration"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const syncMessageTemplateAction = chatbotActionClient
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

      const ctx = {
        auth: integrationWhatsapp.auth as WhatsappAuthValue,
        uploader,
      }

      const res = await integrations.whatsapp.runAction(
        "listMessageTemplates",
        {
          ctx,
        },
      )

      await prisma.$transaction(async (tx) => {
        const existingTemplates = await tx.whatsappMessageTemplate.findMany({
          where: {
            integrationWhatsappId: integrationWhatsapp.id,
          },
          select: {
            id: true,
            sourceId: true,
          },
        })

        const incomingSourceIds = new Set(res.data.map((t) => t.id))

        const templatesToDelete = existingTemplates.filter(
          (t) => !incomingSourceIds.has(t.sourceId),
        )

        if (templatesToDelete.length > 0) {
          await tx.whatsappMessageTemplate.deleteMany({
            where: {
              id: {
                in: templatesToDelete.map((t) => t.id),
              },
            },
          })
        }

        for (const template of res.data) {
          const components = template.components
            ? JSON.parse(JSON.stringify(template.components))
            : []

          await tx.whatsappMessageTemplate.upsert({
            where: {
              integrationWhatsappId_sourceId: {
                integrationWhatsappId: integrationWhatsapp.id,
                sourceId: template.id,
              },
            },
            create: {
              name: template.name,
              integrationWhatsappId: integrationWhatsapp.id,
              language: template.language,
              category: template.category,
              status: template.status,
              sourceId: template.id,
              components,
            },
            update: {
              name: template.name,
              language: template.language,
              category: template.category,
              status: template.status,
              components,
            },
          })
        }
      })

      revalidateCacheTags(`chatbots:${chatbotId}#whatsapp#messageTemplates`)
    },
  )
