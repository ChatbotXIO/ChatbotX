"use server"

import { facebookMarketingMessagesService } from "@chatbotx.io/business"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

/**
 * Local-only delete: the Meta message campaign is deliberately left running
 * (spec O6). The confirm dialog says so, so a user removing a row here knows
 * they still have to pause or delete the campaign in Ads Manager.
 */
export const deleteMarketingMessagesAction = workspaceActionClient
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
      await facebookMarketingMessagesService.remove({
        workspaceId,
        ids: parsedInput.ids,
      })
    },
  )
