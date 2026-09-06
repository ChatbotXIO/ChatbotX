"use server"

import { messengerIntegrationService } from "@chatbotx.io/business"
import { integrationMessengerRepository } from "@chatbotx.io/database/repositories"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    zodBigintAsString(),
  ])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, integrationMessengerId, templateId],
    } = props

    // Verify the integration belongs to the workspace
    const integration = await messengerIntegrationService.findByIdForWorkspace({
      id: integrationMessengerId,
      workspaceId,
    })

    if (!integration) {
      throw new Error("Messenger integration not found")
    }

    await integrationMessengerRepository.deleteMessageTemplate({
      integrationMessengerId,
      templateId,
    })

    await invalidateCacheByTags([
      `workspaces:${workspaceId}#messenger#messageTemplates`,
    ])
  })
