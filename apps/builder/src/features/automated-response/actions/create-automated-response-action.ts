"use server"

import { db } from "@aha.chat/database/client"
import { automatedResponseModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureAllFlowIdsExists } from "@/features/flows/queries"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateAutomatedResponseRequest,
  createAutomatedResponseRequest,
} from "../schemas/action"

export const createAutomatedResponseAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createAutomatedResponseRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateAutomatedResponseRequest
    }) => {
      if (parsedInput.folderId) {
        await ensureFolderIsExists(
          parsedInput.folderId,
          chatbotId,
          "automatedResponse",
        )
      }

      // validate all flow ids
      const flowIds: string[] = []
      for (const reply of parsedInput.replies) {
        if ("flowId" in reply) {
          flowIds.push(reply.flowId)
        }
      }
      await ensureAllFlowIdsExists(chatbotId, [...new Set(flowIds)])

      await db.insert(automatedResponseModel).values({
        ...parsedInput,
        chatbotId,
        status: true,
        userMessages: parsedInput.userMessages.map((m) => m.value),
        id: createId(),
      })

      revalidateCacheTags(`chatbots:${chatbotId}#automatedResponses`)
    },
  )
