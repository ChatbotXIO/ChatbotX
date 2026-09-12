"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateSpreadsheet } from "../lib/manage-spreadsheet"
import { createSpreadsheetRequest } from "../schema/mutation"

const messages = {
  integrationMissing: "You need to setup google sheets first.",
  invalidUrl: "URL must be a valid, public or shareable Google Sheets link.",
}

export const updateSpreadsheetAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(createSpreadsheetRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    try {
      return await updateSpreadsheet({
        workspaceId,
        id,
        data: parsedInput,
        messages,
      })
    } catch (error) {
      if (error instanceof ChatbotXException && error.code === "validation") {
        // Key on the field the service tagged so a validation added on any
        // other field stops mis-rendering under the URL input.
        return returnValidationErrors(createSpreadsheetRequest, {
          [error.field ?? "url"]: { _errors: [error.message] },
        })
      }
      throw error
    }
  })
