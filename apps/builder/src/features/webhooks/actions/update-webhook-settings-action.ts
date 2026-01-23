"use server"

import { prisma } from "@aha.chat/database"
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
      const webhook = await prisma.webhook.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.webhook.update({
        where: {
          id: webhook.id,
        },
        data: parsedInput,
      })

      await updateWebhookCache(chatbotId)
    },
  )
