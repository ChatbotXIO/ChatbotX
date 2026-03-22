"use server"

import { db, eq } from "@aha.chat/database/client"
import { triggerModel } from "@aha.chat/database/schema"
import { z } from "zod"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

const updateTriggerSettingsSchema = z.object({
  name: z.optional(z.string().trim().min(1).max(255)),
  active: z.optional(z.boolean()),
})

type UpdateTriggerSettingsSchema = z.infer<typeof updateTriggerSettingsSchema>

export const updateTriggerSettingsAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateTriggerSettingsSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateTriggerSettingsSchema
    }) => {
      const trigger = await db.query.triggerModel.findFirst({
        where: {
          id,
          chatbotId,
        },
      })

      if (!trigger) {
        throw new Error("Trigger not found")
      }

      await db
        .update(triggerModel)
        .set(parsedInput)
        .where(eq(triggerModel.id, trigger.id))

      revalidateCacheTags(`chatbots:${trigger.chatbotId}#triggers`)
    },
  )
