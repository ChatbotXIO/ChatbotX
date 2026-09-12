"use server"

import { fbCommentAutomationService } from "@chatbotx.io/business"
import { igCommentAutomationTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const bulkDeleteIgCommentsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(z.object({ ids: z.array(zodBigintAsString()) }))
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: { ids: string[] }
    }) => {
      await fbCommentAutomationService.deleteMany({
        workspaceId,
        ids: parsedInput.ids,
        types: [...igCommentAutomationTypes.options],
      })
    },
  )
