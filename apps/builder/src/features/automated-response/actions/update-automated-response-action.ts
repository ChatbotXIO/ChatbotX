"use server"

import { prisma } from "@aha.chat/database"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureAllFlowIdsExists } from "@/features/flows/queries"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { AutomatedResponseException } from "../schemas/types"
import {
  type UpdateAutomatedResponseRequest,
  updateAutomatedResponseRequest,
} from "../schemas/update-automated-responses-schema"

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
      const automatedResponse = await prisma.automatedResponse.findFirst({
        where: {
          chatbotId,
          id,
        },
      })
      if (!automatedResponse) {
        throw new AutomatedResponseException("Automated response not found")
      }

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

      await prisma.automatedResponse.update({
        where: {
          id,
        },
        data: parsedInput,
      })

      revalidateCacheTags(`chatbots:${chatbotId}#automatedResponses`)
    },
  )
