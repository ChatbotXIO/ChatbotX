"use server"

import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { enqueueBulkTagStatsContacts } from "../lib/enqueue-bulk-tag-stats"
import { requireContactPermissionScope } from "../permissions"
import {
  type BulkTagStatsContactsRequest,
  bulkTagStatsContactsRequest,
} from "../schema/contact-tag"

export const bulkTagStatsContactsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkTagStatsContactsRequest)
  .action(
    async ({
      ctx: { user },
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      ctx: { user: { id: string } }
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkTagStatsContactsRequest
    }) => {
      const accessScope = await requireContactPermissionScope(workspaceId)
      await enqueueBulkTagStatsContacts({
        workspaceId,
        requestedUserId: user.id,
        request: parsedInput,
        restrictToAssignedUserId: accessScope.restrictToAssignedUserId,
      })
    },
  )
