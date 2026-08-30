"use server"

import { botFieldService } from "@chatbotx.io/business"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const resetBotFields = async (
  workspaceId: string,
  ids: string[],
): Promise<void> => {
  await botFieldService.bulkClearValues({ workspaceId, ids })
}

export const resetBotFieldsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    await resetBotFields(workspaceId, parsedInput.ids)
  })
