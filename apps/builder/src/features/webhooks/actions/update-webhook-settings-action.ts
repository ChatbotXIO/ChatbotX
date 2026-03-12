"use server"

import { db, eq } from "@aha.chat/database/client"
import { webhookModel } from "@aha.chat/database/schema"
import { updateWebhookCache } from "@aha.chat/events"
import { z } from "zod"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"

const updateWebhookSettingsSchema = z.object({
  name: z.optional(z.string().trim().min(1).max(255)),
  active: z.optional(z.boolean()),
})

type UpdateWebhookSettingsSchema = z.infer<typeof updateWebhookSettingsSchema>

export const updateWebhookSettingsAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateWebhookSettingsSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateWebhookSettingsSchema
    }) => {
      const webhook = await db.query.webhookModel.findFirst({
        where: {
          id,
          chatbotId,
        },
      })

      if (!webhook) {
        throw new Error("Webhook not found")
      }

      await db
        .update(webhookModel)
        .set(parsedInput)
        .where(eq(webhookModel.id, webhook.id))

      await updateWebhookCache(chatbotId)
    },
  )
