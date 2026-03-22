"use server"

import { db, eq } from "@aha.chat/database/client"
import { chatbotModel } from "@aha.chat/database/schema"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateChatbotTokenRequest,
  updateChatbotTokenRequest,
} from "../schemas/action"

const updateChatbotToken = async ({
  chatbotId,
  token,
}: {
  chatbotId: string
  token: string
}) => {
  if (!token.startsWith(chatbotId)) {
    return returnValidationErrors(updateChatbotTokenRequest, {
      _errors: ["Validation Exception"],
      token: {
        _errors: ["Token format is not valid"],
      },
    })
  }

  await db
    .update(chatbotModel)
    .set({ token })
    .where(eq(chatbotModel.id, chatbotId))
}

export const updateChatbotTokenAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(updateChatbotTokenRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpdateChatbotTokenRequest
    }) => {
      await updateChatbotToken({ chatbotId, token: parsedInput.token })
    },
  )
