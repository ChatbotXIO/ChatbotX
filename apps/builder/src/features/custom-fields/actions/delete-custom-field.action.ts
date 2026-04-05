"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { customFieldModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type ChatbotIdRequestParams,
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
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await deleteCustomFields({ workspaceId, ids: parsedInput.ids })
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
