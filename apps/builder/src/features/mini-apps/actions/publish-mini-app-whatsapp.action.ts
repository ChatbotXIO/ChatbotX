"use server"

import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { toPublishResponse } from "../api/mappers"
import { publishMiniAppToWhatsapp } from "../lib/whatsapp-publication"
import { publishMiniAppWhatsappRequest } from "../schema/action"

export const publishMiniAppWhatsappAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(publishMiniAppWhatsappRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const publication = await publishMiniAppToWhatsapp({
      workspaceId,
      miniAppId: id,
      integrationWhatsappId: parsedInput.integrationWhatsappId,
      publish: parsedInput.publish,
    })
    return toPublishResponse(publication)
  })
