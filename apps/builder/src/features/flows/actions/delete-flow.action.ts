"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { flowModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
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
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await db
        .delete(flowModel)
        .where(
          and(
            eq(flowModel.workspaceId, workspaceId),
            inArray(flowModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags(`workspaces:${workspaceId}#flows`)
    },
  )
