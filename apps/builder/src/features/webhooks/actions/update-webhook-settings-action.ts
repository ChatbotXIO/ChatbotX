"use server"

import { webhookService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateWebhookSettingsRequest } from "../schema/update-webhook-schema"

export const updateWebhookSettingsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateWebhookSettingsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await webhookService.updateSettings({
      workspaceId,
      id,
      ...parsedInput,
    })
  })
