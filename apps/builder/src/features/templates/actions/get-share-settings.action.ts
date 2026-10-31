"use server"

import { templateService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { templateActionClient } from "./template-action-client"

/**
 * Reads one template's share link settings. The list payload carries no share
 * token, so the share dialog loads it here on demand (same gate as rotating it).
 */
export const getShareSettingsAction = templateActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async ({ bindArgsParsedInputs: [workspaceId, templateId] }) => {
    const template = await templateService.getDetailOrFail({
      workspaceId,
      templateId,
    })
    return {
      id: template.id,
      shareToken: template.shareToken,
      shareEnabled: template.shareEnabled,
      shareExpiresAt: template.shareExpiresAt,
    }
  })
