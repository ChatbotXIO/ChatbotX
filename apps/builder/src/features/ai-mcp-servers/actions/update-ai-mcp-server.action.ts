"use server"

import { aiMcpServerService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { isValidationException } from "@/lib/errors/validation-exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateAIMcpServerRequest } from "../schema/action"

export const updateAIMcpServerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIMcpServerRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const t = await getTranslations()

    const mcpServer = await aiMcpServerService.findBy({
      where: {
        id,
        workspaceId,
      },
    })
    if (!mcpServer) {
      throw notFoundException(
        t("messages.featureNotFound", { feature: t("fields.mcpServer.label") }),
      )
    }

    try {
      await aiMcpServerService.update({ workspaceId, id }, parsedInput)
    } catch (error) {
      if (isValidationException(error)) {
        return returnValidationErrors(updateAIMcpServerRequest, {
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
