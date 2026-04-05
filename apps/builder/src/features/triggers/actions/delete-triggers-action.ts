"use server"

import { removeTriggerCache } from "@chatbotx/events"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { triggerModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteTriggersAction = workspaceActionClient
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
        .delete(triggerModel)
        .where(
          and(
            eq(triggerModel.workspaceId, workspaceId),
            inArray(triggerModel.id, parsedInput.ids),
          ),
        )

      await removeTriggerCache(workspaceId)
    },
  )
