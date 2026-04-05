"use server"

import { db, isDatabaseError } from "@chatbotx.io/database/client"
import { sequenceModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateSequenceRequest,
  createSequenceRequest,
} from "../schema/action"

export const createSequenceAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSequenceRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
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
          workspaceId,
          name: parsedInput.name,
          folderId: parsedInput.folderId || null,
        })

        revalidateCacheTags([`workspaces:${workspaceId}#sequences`])

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
