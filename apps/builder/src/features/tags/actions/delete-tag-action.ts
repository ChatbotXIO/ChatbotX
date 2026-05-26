"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { and, db, eq, findOrFail, inArray } from "@chatbotx.io/database/client"
import { tagModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteTagAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
      ctx: { user },
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkUpdateIdsRequest
      ctx: { user: { id: string } }
    }) => {
      const names = await db.query.tagModel.findMany({
        columns: { name: true },
        where: { workspaceId, id: { in: parsedInput.ids } },
      })

      await deleteTags({ workspaceId, ids: parsedInput.ids })

      if (names.length > 0) {
        await logAudit({
          workspaceId,
          userId: user.id,
          action: auditLogActions.TAG_DELETED,
          detail: `Etiqueta(s) excluída(s): ${names.map((t) => `"${t.name}"`).join(", ")}`,
        })
      }
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

  revalidateCacheTags(`workspaces:${workspaceId}#tags`)
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

  revalidateCacheTags(`workspaces:${workspaceId}#tags`)
}
