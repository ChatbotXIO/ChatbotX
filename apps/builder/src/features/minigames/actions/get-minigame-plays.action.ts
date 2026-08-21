"use server"

import { minigameContactService } from "@chatbotx.io/business/minigame"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { getMinigamePlaysRequest } from "../schemas/action"

export const getMinigamePlaysAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(getMinigamePlaysRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) =>
    minigameContactService.listPlays({
      workspaceId,
      minigameId: parsedInput.minigameId,
      contactId: parsedInput.contactId,
    }),
  )
