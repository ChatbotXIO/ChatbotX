"use server"

import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toPublishResponse } from "../api/mappers"
import { publishMiniAppWhatsappDraft } from "../lib/publish-to-whatsapp"
import { miniAppWhatsappRequest } from "../schema/action"

export const publishMiniAppWhatsappDraftAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(miniAppWhatsappRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const publication = await publishMiniAppWhatsappDraft({
      workspaceId,
      miniAppId: id,
      integrationWhatsappId: parsedInput.integrationWhatsappId,
    })
    return toPublishResponse(publication)
  })
