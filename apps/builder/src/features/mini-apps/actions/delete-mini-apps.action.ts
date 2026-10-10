"use server"

import { miniAppService } from "@chatbotx.io/business/mini-app"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

// Deleting stays available after trial expiry (read/delete-only workspaces).
export const deleteMiniAppsAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await miniAppService.deleteMany({ workspaceId, ids: parsedInput.ids })
  })
