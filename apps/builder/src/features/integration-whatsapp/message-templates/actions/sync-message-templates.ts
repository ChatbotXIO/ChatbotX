"use server"

import { db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import {
  integrationWhatsappModel,
  whatsappMessageTemplateModel,
} from "@chatbotx.io/database/schema"
import { uploader } from "@chatbotx.io/filesystem"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import { createId } from "@chatbotx.io/utils"
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
      const integrationWhatsapp = await findOrFail(
        integrationWhatsappModel,
        {
          chatbotId,
          id,
        },
        "Whatsapp integration not found",
      )

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

      await db.transaction(async (tx) => {
        const existingTemplates = await tx
          .select({
            id: whatsappMessageTemplateModel.id,
            sourceId: whatsappMessageTemplateModel.sourceId,
          })
          .from(whatsappMessageTemplateModel)
          .where(
            eq(
              whatsappMessageTemplateModel.integrationWhatsappId,
              integrationWhatsapp.id,
            ),
          )

        const incomingSourceIds = new Set(res.data.map((t) => t.id))

        const templatesToDelete = existingTemplates.filter(
          (t) => !incomingSourceIds.has(t.sourceId),
        )

        if (templatesToDelete.length > 0) {
          await tx.delete(whatsappMessageTemplateModel).where(
            inArray(
              whatsappMessageTemplateModel.id,
              templatesToDelete.map((t) => t.id),
            ),
          )
        }

        for (const template of res.data) {
          const existing = existingTemplates.find(
            (t) => t.sourceId === template.id,
          )

          if (existing) {
            await tx
              .update(whatsappMessageTemplateModel)
              .set({
                name: template.name,
                language: template.language,
                category: template.category,
                status: template.status,
                components: template.components,
              })
              .where(eq(whatsappMessageTemplateModel.id, existing.id))
          } else {
            await tx.insert(whatsappMessageTemplateModel).values([
              {
                id: createId(),
                name: template.name,
                integrationWhatsappId: integrationWhatsapp.id,
                language: template.language,
                category: template.category,
                status: template.status,
                sourceId: template.id,
                components: template.components,
              },
            ])
          }
        }
      })

      revalidateCacheTags(`chatbots:${chatbotId}#whatsapp#messageTemplates`)
    },
  )
