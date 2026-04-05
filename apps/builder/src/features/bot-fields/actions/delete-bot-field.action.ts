"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { botFieldModel } from "@chatbotx.io/database/schema"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteBotFieldsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    } = props

    await db
      .delete(botFieldModel)
      .where(
        and(
          eq(botFieldModel.workspaceId, workspaceId),
          inArray(botFieldModel.id, parsedInput.ids),
        ),
      )

    revalidateCacheTags([
      `workspaces:${workspaceId}#botFields`,
      ...parsedInput.ids.map(
        (id) => `workspaces:${workspaceId}#botFields:${id}`,
      ),
    ])
  })
