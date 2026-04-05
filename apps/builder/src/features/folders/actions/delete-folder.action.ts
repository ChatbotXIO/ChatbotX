"use server"

import { and, arrayContains, db, eq, or } from "@chatbotx.io/database/client"
import { folderModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteFolderAction = workspaceActionClient
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
      await db.transaction(async (tx) => {
        for (const id of parsedInput.ids) {
          const folder = await tx.query.folderModel.findFirst({
            where: {
              workspaceId,
              id,
            },
          })
          if (!folder) {
            continue
          }

          await tx
            .delete(folderModel)
            .where(
              and(
                eq(folderModel.workspaceId, workspaceId),
                or(
                  eq(folderModel.id, id),
                  arrayContains(folderModel.paths, [id]),
                ),
              ),
            )

          revalidateCacheTags([
            `workspaces:${workspaceId}#folders:${folder.folderType}`,
            `workspaces:${workspaceId}#folders:${folder.id}`,
          ])
        }
      })
    },
  )
