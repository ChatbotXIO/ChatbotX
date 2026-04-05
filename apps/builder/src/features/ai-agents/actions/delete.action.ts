"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { aiAgentModel } from "@chatbotx.io/database/schema"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { authActionClient } from "@/lib/safe-action"

export const deleteAIAgentAction = authActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput: { ids },
    } = props

    await db
      .delete(aiAgentModel)
      .where(
        and(
          eq(aiAgentModel.workspaceId, workspaceId),
          inArray(aiAgentModel.id, ids),
        ),
      )

    revalidateCacheTags(`workspaces:${workspaceId}#aiAgents`)
  })
