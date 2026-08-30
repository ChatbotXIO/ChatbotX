"use server"

import { tagSyncService } from "@chatbotx.io/business"
import { and, db, eq, inArray, isNull } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

const TAG_CHUNK_SIZE = 200

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
  for (let i = 0; i < ids.length; i += TAG_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + TAG_CHUNK_SIZE)
    const updated = await db
      .update(tagModel)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(tagModel.workspaceId, workspaceId),
          inArray(tagModel.id, chunk),
          isNull(tagModel.deletedAt),
        ),
      )
      .returning({ id: tagModel.id })

    for (const row of updated) {
      await tagSyncService.enqueueDelete({ workspaceId, tagId: row.id })
    }
  }

  await invalidateCacheByTags([`workspaces:${workspaceId}#tags`])
}

export const deleteTag = async ({
  workspaceId,
  id,
}: {
  workspaceId: string
  id: string
}) => {
  const updated = await db
    .update(tagModel)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(tagModel.id, id),
        eq(tagModel.workspaceId, workspaceId),
        isNull(tagModel.deletedAt),
      ),
    )
    .returning({ id: tagModel.id })

  if (updated.length > 0) {
    await tagSyncService.enqueueDelete({ workspaceId, tagId: updated[0].id })
  }

  await invalidateCacheByTags([`workspaces:${workspaceId}#tags`])
}
