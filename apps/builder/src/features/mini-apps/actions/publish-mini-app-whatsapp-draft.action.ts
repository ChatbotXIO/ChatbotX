"use server"

import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
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
    return {
      status: publication.status,
      published: publication.published,
      validationErrors: publication.validationErrors as unknown[],
    }
  })
