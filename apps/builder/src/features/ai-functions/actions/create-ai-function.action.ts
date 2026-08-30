"use server"

import { aiFunctionService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAIFunctionRequest } from "../schema/action"

export const createAIFunctionAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIFunctionRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs
    const t = await getTranslations()

    if (await aiFunctionService.isNameTaken(workspaceId, parsedInput.name)) {
      return returnValidationErrors(createAIFunctionRequest, {
        name: {
          _errors: [
            t("messages.nameAlreadyExists", {
              feature: t("fields.aiFunction.label"),
            }),
          ],
        },
      })
    }

    await aiFunctionService.create(workspaceId, parsedInput)
  })
