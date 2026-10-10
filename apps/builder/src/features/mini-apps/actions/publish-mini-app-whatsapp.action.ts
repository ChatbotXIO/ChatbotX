"use server"

import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { publishMiniAppToWhatsapp } from "../lib/publish-to-whatsapp"
import { publishMiniAppWhatsappRequest } from "../schema/action"

export const publishMiniAppWhatsappAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(publishMiniAppWhatsappRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const publication = await publishMiniAppToWhatsapp({
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
