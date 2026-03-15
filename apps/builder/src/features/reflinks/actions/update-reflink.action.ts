"use server"

import { and, db, eq, isUniqueViolationError } from "@aha.chat/database/client"
import { reflinkModel } from "@aha.chat/database/schema"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpdateReflinkRequest,
  updateReflinkRequest,
} from "../schemas/action"

export const updateReflinkAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateReflinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateReflinkRequest
    }) => {
      try {
        await db
          .update(reflinkModel)
          .set(parsedInput)
          .where(
            and(eq(reflinkModel.id, id), eq(reflinkModel.chatbotId, chatbotId)),
          )

        revalidateCacheTags(`chatbots:${chatbotId}#reflinks`)
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return returnValidationErrors(updateReflinkRequest, {
            _errors: ["Validation Exception"],
            name: { _errors: ["Name is already taken"] },
          })
        }

        throw error
      }
    },
  )
