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
        return returnValidationErrors(createSpreadsheetRequest, {
          url: { _errors: [error.message] },
        })
      }
      throw error
    }
  })
