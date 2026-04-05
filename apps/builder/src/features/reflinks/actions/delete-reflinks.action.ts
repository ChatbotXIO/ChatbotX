"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteReflinksAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await db
        .delete(reflinkModel)
        .where(
          and(
            eq(reflinkModel.workspaceId, workspaceId),
            inArray(reflinkModel.id, parsedInput.ids),
          ),
        )

      revalidateCacheTags(`workspaces:${workspaceId}#reflinks`)
    },
  )
