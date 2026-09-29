"use server"

import { aiMcpServerService } from "@chatbotx.io/business"
import { resolveBotFieldVariableText } from "@chatbotx.io/variables"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { createPrivateAIMcpServerRequest } from "../schema/action"

export const createAIMcpServerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createPrivateAIMcpServerRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const t = await getTranslations()

    if (parsedInput.auth.type === "token") {
      const resolution = await resolveBotFieldVariableText({
        text: parsedInput.auth.token,
        workspaceId,
      })
      if (resolution.status !== "resolved") {
        return returnValidationErrors(createPrivateAIMcpServerRequest, {
          auth: { token: { _errors: [t("validation.invalidApiKey")] } },
        })
      }
    }

    try {
      await aiMcpServerService.create(workspaceId, parsedInput)
    } catch (error) {
      if (isValidationException(error)) {
        return returnValidationErrors(createPrivateAIMcpServerRequest, {
          name: {
            _errors: [
              t("messages.nameAlreadyExists", {
                feature: t("fields.mcpServer.label"),
              }),
            ],
          },
        })
      }

      throw error
    }
  })
