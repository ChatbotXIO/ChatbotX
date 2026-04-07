"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { webhookModel } from "@chatbotx.io/database/schema"
import { removeWebhookCache } from "@chatbotx.io/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteWebhooksAction = workspaceActionClient
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
        .delete(webhookModel)
        .where(
          and(
            eq(webhookModel.workspaceId, workspaceId),
            inArray(webhookModel.id, parsedInput.ids),
          ),
        )

      await removeWebhookCache(workspaceId)
    },
  )
