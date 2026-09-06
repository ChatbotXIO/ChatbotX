"use server"

import { sequenceService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
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
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateSequenceRequest
    }) => {
      const t = await getTranslations()

      try {
        return await sequenceService.create({
          workspaceId,
          name: parsedInput.name,
          folderId: parsedInput.folderId,
        })
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "validation"
        ) {
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
