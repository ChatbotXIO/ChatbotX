"use server"

import { auditService } from "@chatbotx.io/business/audit"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { webhookModel } from "@chatbotx.io/database/schema"
import { removeWebhookCache } from "@chatbotx.io/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
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
      const deletedWebhooks = await db.query.webhookModel.findMany({
        where: { workspaceId, id: { in: parsedInput.ids } },
        columns: { id: true },
      })

      await db
        .delete(webhookModel)
        .where(
          and(
            eq(webhookModel.workspaceId, workspaceId),
            inArray(webhookModel.id, parsedInput.ids),
          ),
        )

      await removeWebhookCache(workspaceId)

      if (deletedWebhooks.length > 0) {
        await auditService.record({
          workspaceId,
          action: "delete",
          detail: `deleted webhook${deletedWebhooks.length > 1 ? "s" : ""} (${deletedWebhooks.map((webhook) => `#${webhook.id}`).join(", ")})`,
        })
      }
    },
  )
