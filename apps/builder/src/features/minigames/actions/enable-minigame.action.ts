"use server"

import { minigameService } from "@chatbotx.io/business/minigame"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const enableRequest = z.object({
  enabled: z.boolean(),
})

export const enableMinigameAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(enableRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    await minigameService.setEnabled({ workspaceId, id }, parsedInput.enabled)
  })
