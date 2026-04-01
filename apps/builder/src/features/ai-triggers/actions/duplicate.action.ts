"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"

export const duplicateAITriggerAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
    }) => {
      const targetAITrigger = await findOrFail(
        aiTriggerModel,
        {
          id,
          chatbotId,
        },
        "AITrigger not found",
      )
      const { id: eid, name, createdAt, updatedAt, ...rest } = targetAITrigger

      await db.insert(aiTriggerModel).values({
        ...rest,
        name: `${name} _copy`,
        id: createId(),
      })

      revalidateCacheTags(`chatbots:${chatbotId}#aiTriggers`)
    },
  )
