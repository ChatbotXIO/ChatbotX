"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { automatedResponseModel } from "@chatbotx.io/database/schema"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    await db
      .delete(automatedResponseModel)
      .where(
        and(
          eq(automatedResponseModel.workspaceId, workspaceId),
          inArray(automatedResponseModel.id, parsedInput.ids),
        ),
      )

    revalidateCacheTags(`workspaces:${workspaceId}#automatedResponses`)
  })
