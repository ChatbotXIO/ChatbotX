"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const bulkDeleteIgStoriesAction = workspaceActionClient
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
      if (parsedInput.ids.length === 0) {
        return
      }

      await db
        .delete(igStoryAutomationModel)
        .where(
          and(
            inArray(igStoryAutomationModel.id, parsedInput.ids),
            eq(igStoryAutomationModel.workspaceId, workspaceId),
          ),
        )
    },
  )
