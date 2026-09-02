"use server"

import { aiMcpServerService } from "@chatbotx.io/business"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAIMcpServerRequest } from "../schema/action"

export const createAIMcpServerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIMcpServerRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const t = await getTranslations()

    const existing = await aiMcpServerService.findBy({
      where: { workspaceId, name: parsedInput.name },
    })
    if (existing) {
      return returnValidationErrors(createAIMcpServerRequest, {
        name: {
          _errors: [
            t("messages.nameAlreadyExists", {
              feature: t("fields.mcpServer.label"),
            }),
          ],
        },
      })
    }

    await aiMcpServerService.create(workspaceId, parsedInput)
  })
