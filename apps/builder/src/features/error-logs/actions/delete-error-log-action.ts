"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { errorLogModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteErrorLogAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await db
        .delete(errorLogModel)
        .where(
          and(
            eq(errorLogModel.workspaceId, workspaceId),
            inArray(errorLogModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags(`workspaces:${workspaceId}#errorLogs`)
    },
  )
