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
      const deletedFlows = await db.query.flowModel.findMany({
        where: {
          workspaceId,
          id: {
            in: parsedInput.ids,
          },
        },
      })
      if (deletedFlows.length === 0) {
        return
      }

      const deletedFlowIds = deletedFlows.map((flow) => flow.id)

      await db.transaction(async (tx) => {
        await tx
          .delete(flowModel)
          .where(inArray(flowModel.id, deletedFlowIds))

        await tx
          .update(flowAnalyticsSessionModel)
          .set({
            deletedAt: new Date(),
          })
          .where(
                    inArray(flowAnalyticsSessionModel.flowId, deletedFlowIds),
          )
      })
    },
  )
