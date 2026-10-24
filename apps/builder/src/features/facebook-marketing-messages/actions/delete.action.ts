"use server"

import type { WorkspaceModel } from "@chatbotx.io/database/types"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { deleteMarketingMessages } from "../lib/campaign-operations"

/**
 * Deletes the Meta message campaign first, then the row (spec D10). A Meta
 * failure keeps the row so the user can retry. Allowed on a trial-expired
 * workspace (invariant 14: read/delete-only, never locked out).
 */
export const deleteMarketingMessagesAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      ctx,
      parsedInput,
    }: {
      ctx: { workspace: WorkspaceModel }
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await deleteMarketingMessages({
        workspace: ctx.workspace,
        ids: parsedInput.ids,
      })
    },
  )
