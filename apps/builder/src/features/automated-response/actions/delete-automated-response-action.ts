"use server"

import { automatedResponseService } from "@chatbotx.io/business"
import { automatedResponseTypes } from "@chatbotx.io/database/partials"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([...workspaceIdrequestParams, automatedResponseTypes])
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, type],
      parsedInput,
    } = props

    await automatedResponseService.deleteMany(
      workspaceId,
      parsedInput.ids,
      type,
    )
  })
