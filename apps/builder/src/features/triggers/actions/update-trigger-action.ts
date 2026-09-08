"use server"

import { triggerService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { toConditionColumns } from "@/features/conditions/to-condition-columns"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateTriggerSchema } from "../schema/mutation"

export const updateTriggerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateTriggerSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const { conditions, actions } = parsedInput

    return await triggerService.updateWithConditions({
      workspaceId,
      id,
      actions,
      conditions: conditions.map((condition) => ({
        id: "id" in condition ? condition.id : undefined,
        ...toConditionColumns(condition),
      })),
    })
  })
