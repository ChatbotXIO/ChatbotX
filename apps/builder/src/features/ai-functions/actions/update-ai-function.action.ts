"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiFunctionService } from "../ai-function.service"
import { updateAIFunctionRequest } from "../schemas/action"

export const updateAIFunctionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIFunctionRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const t = await getTranslations()

    if (
      await aiFunctionService.isNameTaken(workspaceId, parsedInput.name, id)
    ) {
      return returnValidationErrors(updateAIFunctionRequest, {
        name: {
          _errors: [
            t("messages.nameAlreadyExists", {
              feature: t("fields.aiFunction.label"),
            }),
          ],
        },
      })
    }

    return aiFunctionService.updateAIFunction(
      { workspaceId, id },
      parsedInput,
      t,
    )
  })
