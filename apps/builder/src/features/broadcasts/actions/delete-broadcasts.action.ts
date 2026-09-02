"use server"

import { broadcastService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

// AllowExpired (not strict): invariant 14 — delete stays available after
// trial expiry, a deliberate divergence from the questionnaires bulk-delete
// precedent, matching the single deleteBroadcastAction below.
export const deleteBroadcastsAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const result = await broadcastService.softDeleteBroadcasts({
      workspaceId,
      ids: parsedInput.ids,
    })

    // Some requested ids can be silently skipped (already deleted, foreign,
    // or `sending`) — only audit when something actually changed.
    if (result.deletedCount > 0) {
      await auditService.record({
        workspaceId,
        action: "delete",
        detail: `deleted ${result.deletedCount} broadcast(s)`,
      })
    }

    return result
  })
