"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { aiTriggerModel } from "@chatbotx.io/database/schema"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteAITriggerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput: { ids },
    } = props

    await db
      .delete(aiTriggerModel)
      .where(
        and(
          eq(aiTriggerModel.workspaceId, workspaceId),
          inArray(aiTriggerModel.id, ids),
        ),
      )

    revalidateCacheTags(`workspaces:${workspaceId}#aiTriggers`)
  })
