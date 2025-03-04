"use server"

import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureAllFlowIdsExists } from "@/features/flows/queries"
import { chatbotActionClient } from "@/lib/safe-action"
import { prisma } from "@ahachat.ai/database"
import {
  type UpdateAutomatedResponseRequest,
  updateAutomatedResponseRequest,
} from "../schemas/update-automated-responses-schema"
import { AutomatedResponseException } from "../schemas/utils"
import { revalidateTag } from "next/cache"

export const updateAutomatedResponseAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams.items)
  .schema(updateAutomatedResponseRequest)
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
      const flowIds = []
      if (parsedInput.replies) {
        for (const reply of parsedInput.replies) {
          if ("flowId" in reply) {
            flowIds.push(reply.flowId)
          }
        }
      }
      await ensureAllFlowIdsExists(chatbotId, [...new Set(flowIds)])

      await prisma.automatedResponse.update({
        where: {
          id,
        },
        data: parsedInput,
      })

      revalidateTag(`chatbot:${chatbotId}#automatedResponses`)
    },
  )
