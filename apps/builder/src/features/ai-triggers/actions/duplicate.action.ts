"use server"

import { db, findOrFail } from "@aha.chat/database/client"
import { aiTriggerModel } from "@aha.chat/database/schema"
import type { AITriggerModel } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
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
      const targetAITrigger = await findOrFail<AITriggerModel>(
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
