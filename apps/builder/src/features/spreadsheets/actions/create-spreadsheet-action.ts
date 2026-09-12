"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createSpreadsheet } from "../lib/manage-spreadsheet"
import {
  type CreateSpreadsheetRequest,
  createSpreadsheetRequest,
} from "../schema/mutation"

const messages = {
  integrationMissing: "You need to setup google sheets first.",
  invalidUrl: "URL must be a valid, public or shareable Google Sheets link.",
}

export const createSpreadsheetAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createSpreadsheetRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateSpreadsheetRequest
    }) => {
      try {
        return await createSpreadsheet({
          workspaceId,
          data: parsedInput,
          messages,
        })
      } catch (error) {
        if (error instanceof ChatbotXException && error.code === "validation") {
          return returnValidationErrors(createSpreadsheetRequest, {
            url: { _errors: [error.message] },
          })
        }
        throw error
      }
    },
  )
