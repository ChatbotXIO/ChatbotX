"use server"

import { messengerIntegrationService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  invalidateMessengerTemplatesCache,
  syncMessengerMessageTemplatesForIntegration,
} from "../lib/message-template-operations"

export const syncMessengerMessageTemplateAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const integrationMessenger =
      await messengerIntegrationService.findByIdForWorkspace({
        workspaceId,
        id,
      })
    if (!integrationMessenger) {
      throw new Error("Messenger integration not found")
    }

    await syncMessengerMessageTemplatesForIntegration({
      workspaceId,
      integrationMessenger,
    })

    await invalidateMessengerTemplatesCache([workspaceId])
  })
