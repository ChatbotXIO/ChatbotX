"use server"

import { dynamicImageService } from "@chatbotx.io/business/dynamic-image"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const enableRequest = z.object({
  enabled: z.boolean(),
})

export const enableDynamicImageAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(enableRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    await dynamicImageService.setEnabled(
      { workspaceId, id },
      parsedInput.enabled,
    )
  })
