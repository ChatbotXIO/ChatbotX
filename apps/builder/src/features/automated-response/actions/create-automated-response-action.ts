"use server"

import { FolderType, prisma } from "@aha.chat/database"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureAllFlowIdsExists } from "@/features/flows/queries"
import { ensureFolderIdExists } from "@/features/folders/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateAutomatedResponseRequest,
  createAutomatedResponseRequest,
} from "../schemas/create-automated-responses-schema"

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
        await ensureFolderIdExists(
          chatbotId,
          FolderType.automatedResponse,
          parsedInput.folderId,
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

      await prisma.automatedResponse.create({
        data: {
          ...parsedInput,
          chatbotId,
          status: true,
        },
      })

      revalidateCacheTags(`chatbots:${chatbotId}#automatedResponses`)
    },
  )
