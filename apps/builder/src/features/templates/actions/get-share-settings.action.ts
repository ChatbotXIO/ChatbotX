"use server"

import { resolveTemplateShareUrl, templateService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { templateActionClient } from "./template-action-client"

/** Loaded on demand: the list payload carries no share token. */
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
      shareUrl: await resolveTemplateShareUrl({
        workspaceId,
        templateId,
        shareToken: template.shareToken,
      }),
      shareEnabled: template.shareEnabled,
      shareExpiresAt: template.shareExpiresAt,
    }
  })
