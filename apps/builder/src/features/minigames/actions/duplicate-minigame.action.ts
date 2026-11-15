"use server"

import { minigameService } from "@chatbotx.io/business/minigame"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const duplicateMinigameAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => {
    const minigame = await minigameService.duplicate({ workspaceId, id })
    return { id: minigame.id }
  })
