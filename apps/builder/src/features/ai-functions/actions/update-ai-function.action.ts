"use server"

import { aiFunctionService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateAIFunctionRequest } from "../schema/action"

export const updateAIFunctionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIFunctionRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const t = await getTranslations()

    try {
      return await aiFunctionService.updateAIFunction(
        { workspaceId, id },
        parsedInput,
      )
    } catch (error) {
      if (isValidationException(error)) {
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

      throw error
    }
  })
