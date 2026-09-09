"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { sequenceService } from "@chatbotx.io/business/sequence"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
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
        if (isValidationException(error)) {
          return returnValidationErrors(createSequenceRequest, {
            _errors: [t("sequences.validation.exception")],
            name: {
              _errors: [t("sequences.validation.nameExists")],
            },
          })
        }

        // A `ChatbotXException` (e.g. not-found) already carries a correct
        // status/message — rethrow it unchanged so it doesn't get masked as
        // a generic 500. Only genuinely unknown errors get wrapped.
        if (error instanceof ChatbotXException) {
          throw error
        }

        throw new Error("Failed to create sequence")
      }
    },
  )
