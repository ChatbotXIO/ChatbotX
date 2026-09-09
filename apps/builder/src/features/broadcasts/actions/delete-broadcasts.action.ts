"use server"

import { broadcastService } from "@chatbotx.io/business"
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
    // The service owns the deletable-status guard and the audit record
    // (only when `deletedCount > 0`) — shared with the public API's
    // `delete` route.
    return await broadcastService.softDeleteBroadcasts({
      workspaceId,
      ids: parsedInput.ids,
    })
  })
