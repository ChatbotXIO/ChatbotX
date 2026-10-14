"use server"

import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { deleteMiniAppWhatsappDraft } from "../lib/publish-to-whatsapp"
import { miniAppWhatsappRequest } from "../schema/action"

// Deleting stays available after trial expiry (read/delete-only workspaces).
export const deleteMiniAppWhatsappDraftAction =
  workspaceActionClientAllowExpired
    .bindArgsSchemas(workspaceIdAndIdRequestParams)
    .inputSchema(miniAppWhatsappRequest)
    .action(
      async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) =>
        await deleteMiniAppWhatsappDraft({
          workspaceId,
          miniAppId: id,
          integrationWhatsappId: parsedInput.integrationWhatsappId,
        }),
    )
