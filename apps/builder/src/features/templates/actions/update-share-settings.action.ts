"use server"

import { templateService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { updateShareSettingsRequest } from "../schemas/mutation"
import { templateActionClient } from "./template-action-client"

export const updateShareSettingsAction = templateActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateShareSettingsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const template = await templateService.updateShareSettings({
      workspaceId,
      templateId: parsedInput.templateId,
      shareEnabled: parsedInput.shareEnabled,
      shareExpiresAt: parsedInput.shareExpiresAt
        ? new Date(parsedInput.shareExpiresAt)
        : null,
    })
    return { shareToken: template.shareToken }
  })
