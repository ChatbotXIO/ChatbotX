"use server"

import { db } from "@chatbotx.io/database/client"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateAutomatedResponseRequest,
  createAutomatedResponseRequest,
} from "../schema/action"

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
          return returnValidationErrors(createAutomatedResponseRequest, {
            _errors: ["Validation Exception"],
            flowId: {
              _errors: ["Flow not found"],
            },
          })
        }
        parsedInput.text = null
      }

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
