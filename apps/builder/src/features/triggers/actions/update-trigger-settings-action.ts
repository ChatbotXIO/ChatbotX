"use server"

import { prisma } from "@aha.chat/database"
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
      const trigger = await prisma.trigger.findFirstOrThrow({
        where: {
          id,
          chatbotId,
        },
      })

      await prisma.trigger.update({
        where: {
          id: trigger.id,
        },
        data: parsedInput,
      })

      revalidateCacheTags(`chatbots:${trigger.chatbotId}#triggers`)
    },
  )
