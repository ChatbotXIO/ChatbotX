"use server"

import { db, isDatabaseError } from "@aha.chat/database/client"
import { sequenceModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type CreateSequenceRequest,
  createSequenceRequest,
} from "../schemas/create-sequence-schema"

export const createSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(createSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: CreateSequenceRequest
    }) => {
      const t = await getTranslations()

      try {
        const sequenceId = createId()

        await db.insert(sequenceModel).values({
          id: sequenceId,
          chatbotId,
          name: parsedInput.name,
          folderId: parsedInput.folderId || null,
        })

        revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

        return { sequenceId }
      } catch (error) {
        if (isDatabaseError(error) && error.cause.code === "23505") {
          return returnValidationErrors(createSequenceRequest, {
            _errors: [t("sequences.validation.exception")],
            name: {
              _errors: [t("sequences.validation.nameExists")],
            },
          })
        }

        throw new Error("Failed to create sequence")
      }
    },
  )
