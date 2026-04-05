"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { folderModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import {
  type EditFolderSchema,
  editFolderSchema,
} from "@/features/folders/schema/action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const editFolderAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(editFolderSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await editFolder({ workspaceId, id }, parsedInput)
  })

export const editFolder = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: EditFolderSchema,
) => {
  const folder = await findOrFail({
    table: folderModel,
    where: {
      workspaceId: ctx.workspaceId,
      id: ctx.id,
    },
    message: "Folder not found",
  })

  await db.transaction(async (tx) => {
    await tx
      .update(folderModel)
      .set(parsedInput)
      .where(eq(folderModel.id, folder.id))

    revalidateCacheTags([
      `workspaces:${ctx.workspaceId}#folders:${folder.folderType}`,
      `workspaces:${ctx.workspaceId}#folders:${folder.id}`,
    ])
  })
}
