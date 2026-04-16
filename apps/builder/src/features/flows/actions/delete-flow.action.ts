"use server"

import { and, db, eq, inArray, sql } from "@chatbotx.io/database/client"
import {
  flowAnalyticsSessionModel,
  flowModel,
} from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteFlowAction = workspaceActionClient
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
      await db.transaction(async (tx) => {
        await tx
          .delete(flowModel)
          .where(
            and(
              eq(flowModel.workspaceId, workspaceId),
              inArray(flowModel.id, parsedInput.ids),
            ),
          )

        await tx
          .update(flowAnalyticsSessionModel)
          .set({
            deletedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(
            and(
              eq(flowAnalyticsSessionModel.workspaceId, workspaceId),
              inArray(flowAnalyticsSessionModel.flowId, parsedInput.ids),
            ),
          )
      })

      revalidateCacheTags(`workspaces:${workspaceId}#flows`)
    },
  )
