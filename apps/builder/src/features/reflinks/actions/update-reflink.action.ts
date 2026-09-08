"use server"

import { reflinkService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateReflinkRequest } from "../schema/action"

export const updateReflinkAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateReflinkRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    try {
      await reflinkService.update({ workspaceId, id }, parsedInput)
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "validation"
      ) {
        return returnValidationErrors(updateReflinkRequest, {
          _errors: ["Validation Exception"],
          name: { _errors: ["Name is already taken"] },
        })
      }

      throw error
    }
  })
