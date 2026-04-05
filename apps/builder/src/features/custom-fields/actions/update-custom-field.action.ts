"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { customFieldModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ensureFolderIsExists } from "@/features/folders/actions/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateCustomFieldRequest,
  updateCustomFieldRequest,
} from "../schemas/action"

export const updateCustomFieldAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateCustomFieldRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await updateCustomField({ workspaceId, id }, parsedInput)
  })

export const updateCustomField = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateCustomFieldRequest,
) => {
  const customField = await findOrFail({
    table: customFieldModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Custom field not found",
  })

  if (parsedInput.folderId && parsedInput.folderId !== customField.folderId) {
    await ensureFolderIsExists(
      parsedInput.folderId,
      ctx.workspaceId,
      "customField",
    )
  }

  await db
    .update(customFieldModel)
    .set(parsedInput)
    .where(eq(customFieldModel.id, ctx.id))

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#customFields`)
}
