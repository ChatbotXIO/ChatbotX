"use server"

import { templateService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { templateActionClient } from "./template-action-client"

export const updateInstallationAutoUpdateAction = templateActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(z.object({ autoUpdate: z.boolean() }))
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, installationId],
      parsedInput,
    }) => {
      await templateService.updateInstallationAutoUpdate({
        workspaceId,
        installationId,
        autoUpdate: parsedInput.autoUpdate,
      })
    },
  )
