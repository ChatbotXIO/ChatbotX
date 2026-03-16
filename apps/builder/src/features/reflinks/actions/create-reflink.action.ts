"use server"

import { db, isUniqueViolationError } from "@aha.chat/database/client"
import { reflinkModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateReflinkRequest,
  createReflinkRequest,
} from "../schemas/action"

export const createReflinkAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createReflinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateReflinkRequest
    }) => {
      try {
        await db.insert(reflinkModel).values({
          id: createId(),
          chatbotId,
          ...parsedInput,
        })

        revalidateCacheTags(`chatbots:${chatbotId}#reflinks`)
      } catch (error) {
        if (isUniqueViolationError(error)) {
          return returnValidationErrors(createReflinkRequest, {
            _errors: ["Validation Exception"],
            name: { _errors: ["Name is already taken"] },
          })
        }

        throw error
      }
    },
  )
