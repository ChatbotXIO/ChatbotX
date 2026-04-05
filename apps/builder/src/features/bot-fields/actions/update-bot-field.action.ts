"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { botFieldModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdAndIdRequestParams,
  workspaceIdAndIdRequestParams,
} from "@/features/common/schemas"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateBotFieldRequest,
  updateBotFieldRequest,
} from "../schemas/action"

export const updateBotField = async ({
  workspaceId,
  id,
  parsedInput,
}: {
  workspaceId: string
  id: string
  parsedInput: UpdateBotFieldRequest
}) => {
  const botField = await findOrFail({
    table: botFieldModel,
    where: {
      id,
      workspaceId,
    },
    message: "Account field not found",
  })

  if (parsedInput.folderId && parsedInput.folderId !== botField.folderId) {
    await ensureFolderIsExists(parsedInput.folderId, workspaceId, "customField")
  }

  const updatedBotField = await db
    .update(botFieldModel)
    .set(parsedInput)
    .where(eq(botFieldModel.id, id))
    .returning()
    .then((result) => result[0])

  revalidateCacheTags([
    `workspaces:${workspaceId}#botFields`,
    `workspaces:${workspaceId}#botFields:${id}`,
  ])

  return updatedBotField
}

export const updateBotFieldAction = workspaceActionClient
  .inputSchema(updateBotFieldRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, id],
    }: {
      parsedInput: UpdateBotFieldRequest
      bindArgsParsedInputs: WorkspaceIdAndIdRequestParams
    }) => {
      return await updateBotField({ workspaceId, id, parsedInput })
    },
  )
