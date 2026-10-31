"use server"

import { templateService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { parseShareExpiry } from "../lib/share-expiry"
import { updateShareSettingsRequest } from "../schema/mutation"
import { templateActionClient } from "./template-action-client"

export const updateShareSettingsAction = templateActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateShareSettingsRequest)
  .action(
    async ({
      ctx: { templateActor },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }) => {
      const template = await templateService.updateShareSettings({
        workspaceId,
        templateId: parsedInput.templateId,
        shareEnabled: parsedInput.shareEnabled,
        shareExpiresAt: parseShareExpiry(parsedInput.shareExpiresAt),
        actor: templateActor,
      })
      return {
        shareToken: template.shareToken,
        shareExpiresAt: template.shareExpiresAt,
      }
    },
  )
