"use server"

import { webhookService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { toConditionColumns } from "@/features/conditions/to-condition-columns"
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

    return await webhookService.updateWithConditions({
      workspaceId,
      id,
      url,
      conditions: conditions.map((condition) => ({
        id: "id" in condition ? condition.id : undefined,
        ...toConditionColumns(condition),
      })),
    })
  })
