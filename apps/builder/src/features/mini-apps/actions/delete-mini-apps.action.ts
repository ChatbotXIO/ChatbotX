"use server"

import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { deleteMiniApps } from "../lib/delete-mini-apps"
import { deleteMiniAppsRequest } from "../schema/action"

// Deleting stays available after trial expiry (read/delete-only workspaces).
export const deleteMiniAppsAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteMiniAppsRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
      await deleteMiniApps({
        workspaceId,
        ids: parsedInput.ids,
        deleteWhatsappFlows: parsedInput.deleteWhatsappFlows,
      }),
  )
