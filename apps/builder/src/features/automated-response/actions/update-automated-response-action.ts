"use server"

import { db, findOrFail } from "@aha.chat/database/client"
import { automatedResponseModel } from "@aha.chat/database/schema"
import type { AutomatedResponseModel } from "@aha.chat/database/types"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureAllFlowIdsExists } from "@/features/flows/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateAutomatedResponseRequest,
  updateAutomatedResponseRequest,
} from "../schemas/action"

export const updateAutomatedResponseAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateAutomatedResponseRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateAutomatedResponseRequest
    }) => {
      await findOrFail<AutomatedResponseModel>(
        automatedResponseModel,
        {
          chatbotId,
          id,
        },
        "Automated response not found",
      )

      // ensure all input flows are exists
      const flowIds: string[] = []
      if (parsedInput.replies) {
        for (const reply of parsedInput.replies) {
          if ("flowId" in reply) {
            flowIds.push(reply.flowId)
          }
        }
        await ensureAllFlowIdsExists(chatbotId, [...new Set(flowIds)])
      }

      await db.update(automatedResponseModel).set({
        ...parsedInput,
        userMessages: parsedInput.userMessages?.map((m) => m.value) ?? [],
      })

      revalidateCacheTags(`chatbots:${chatbotId}#automatedResponses`)
    },
  )
