"use server"

import { auditLogActions, logAudit } from "@chatbotx.io/business"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { customFieldModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteFieldsAction = workspaceActionClient
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
      const names = await db.query.customFieldModel.findMany({
        columns: { name: true },
        where: { workspaceId, id: { in: parsedInput.ids } },
      })
      await deleteCustomFields({ workspaceId, ids: parsedInput.ids })
      if (names.length > 0) {
        await logAudit({
          workspaceId,
          userId: user.id,
          action: auditLogActions.CUSTOM_FIELD_DELETED,
          detail: `Campo(s) personalizado(s) excluído(s): ${names.map((f) => `"${f.name}"`).join(", ")}`,
        })
      }
    },
  )

export const deleteCustomFields = async ({
  workspaceId,
  ids,
}: {
  workspaceId: string
  ids: string[]
}) => {
  await db
    .delete(customFieldModel)
    .where(
      and(
        eq(customFieldModel.workspaceId, workspaceId),
        inArray(customFieldModel.id, ids),
      ),
    )

  revalidateCacheTags(`workspaces:${workspaceId}#customFields`)
}
