"use server"

import { templateSyncRequestService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { installerActionClient } from "./installer-action-client"

/** The installer's switch for what the publisher may see and do; like retry and sync it needs only the right to see installs. */
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
