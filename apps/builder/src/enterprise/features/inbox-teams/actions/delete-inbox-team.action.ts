"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { inboxTeamModel } from "@chatbotx.io/database/schema"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteInboxTeamAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    await db
      .delete(inboxTeamModel)
      .where(
        and(
          eq(inboxTeamModel.workspaceId, workspaceId),
          inArray(inboxTeamModel.id, parsedInput.ids),
        ),
      )

    revalidateCacheTags(`workspaces:${workspaceId}#inboxTeams`)
  })
