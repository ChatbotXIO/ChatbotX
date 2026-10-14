"use server"

import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { getMiniAppWhatsappPreview } from "../lib/publish-to-whatsapp"
import { miniAppWhatsappRequest } from "../schema/action"

export const getMiniAppWhatsappPreviewAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(miniAppWhatsappRequest)
  .action(
    async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) =>
      await getMiniAppWhatsappPreview({
        workspaceId,
        miniAppId: id,
        integrationWhatsappId: parsedInput.integrationWhatsappId,
      }),
  )
