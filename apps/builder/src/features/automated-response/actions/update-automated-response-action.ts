"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateAutomatedResponseRequest,
  updateAutomatedResponseRequest,
} from "../schema/action"

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
      const automatedResponse = await findOrFail(
        automatedResponseModel,
        {
          chatbotId,
          id,
        },
        "Automated response not found",
      )

      // validate flow id if text is not provided
      if (parsedInput.text) {
        parsedInput.flowId = null
      } else if (parsedInput.flowId) {
        const exists = await db.query.flowModel.findFirst({
          columns: {
            id: true,
          },
          where: {
            id: parsedInput.flowId,
            chatbotId,
          },
        })
        if (!exists) {
          return returnValidationErrors(updateAutomatedResponseRequest, {
            _errors: ["Validation Exception"],
            flowId: {
              _errors: ["Flow not found"],
            },
          })
        }
        parsedInput.text = null
      }

      await db
        .update(automatedResponseModel)
        .set({
          ...parsedInput,
          userMessages: parsedInput.userMessages?.map((m) => m.value) ?? [],
        })
        .where(eq(automatedResponseModel.id, automatedResponse.id))

      revalidateCacheTags(`chatbots:${chatbotId}#automatedResponses`)
    },
  )
