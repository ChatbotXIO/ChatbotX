"use server"

import { templateSyncRequestService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { installerActionClient } from "./installer-action-client"

export const setPublisherUninstallGrantAction = installerActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(z.object({ granted: z.boolean() }))
  .action(
    async ({
      ctx: { templateActor },
      bindArgsParsedInputs: [workspaceId, installationId],
      parsedInput,
    }) => {
      await templateSyncRequestService.setPublisherUninstallGrant({
        workspaceId,
        installationId,
        actor: templateActor,
        granted: parsedInput.granted,
      })
      return { granted: parsedInput.granted }
    },
  )
