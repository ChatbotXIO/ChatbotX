"use server"

import {
  and,
  db,
  eq,
  findOrFail,
  isDatabaseError,
} from "@aha.chat/database/client"
import { sequenceModel } from "@aha.chat/database/schema"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdAndIdRequestParams,
  chatbotIdAndIdRequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import { type UpdateSequenceSchema, updateSequenceSchema } from "../schema"

export const updateSequenceAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdAndIdRequestParams)
  .inputSchema(updateSequenceSchema)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId, id],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdAndIdRequestParams
      parsedInput: UpdateSequenceSchema
    }) => {
      const t = await getTranslations()

      await findOrFail(
        sequenceModel,
        {
          id,
          chatbotId,
        },
        "Sequence not found",
      )

      try {
        await db
          .update(sequenceModel)
          .set(parsedInput)
          .where(
            and(
              eq(sequenceModel.id, id),
              eq(sequenceModel.chatbotId, chatbotId),
            ),
          )
      } catch (error) {
        if (isDatabaseError(error) && error.cause.code === "23505") {
          return returnValidationErrors(updateSequenceSchema, {
            _errors: [t("sequences.validation.exception")],
            name: {
              _errors: [t("sequences.validation.nameExists")],
            },
          })
        }

        throw new Error("Failed to update sequence")
      }

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])
    },
  )
