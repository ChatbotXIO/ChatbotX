"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const bulkDeleteFbCommentsAction = workspaceActionClient
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
        .delete(fbCommentAutomationModel)
        .where(
          and(
            inArray(fbCommentAutomationModel.id, parsedInput.ids),
            eq(fbCommentAutomationModel.workspaceId, workspaceId),
          ),
        )
    },
  )
