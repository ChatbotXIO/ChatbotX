"use server"

import { webhookService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateWebhookRequest } from "../schema/update-webhook-schema"

export const updateWebhookAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateWebhookRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const { conditions, url } = parsedInput

    // `toConditionColumnsShared` inside `updateWithConditions` already
    // normalizes each condition's columns (`?? null` defaults) — mapping
    // again here was dead work now that the service owns it.
    return await webhookService.updateWithConditions({
      workspaceId,
      id,
      url,
      conditions,
    })
  })
