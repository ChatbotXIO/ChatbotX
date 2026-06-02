"use server"

import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await deleteTags({ workspaceId, ids: parsedInput.ids })
    },
  )

export const deleteTags = async ({
  workspaceId,
  ids,
}: {
  workspaceId: string
  ids: string[]
}) => {
  await db
    .delete(tagModel)
    .where(
      and(eq(tagModel.workspaceId, workspaceId), inArray(tagModel.id, ids)),
    )
}

export const deleteTag = async ({
  workspaceId,
  id,
}: {
  workspaceId: string
  id: string
}) => {
  const tag = await findOrFail({
    table: tagModel,
    where: {
      workspaceId,
      id,
    },
    message: "Tag not found",
  })

  await db.delete(tagModel).where(eq(tagModel.id, tag.id))
}
