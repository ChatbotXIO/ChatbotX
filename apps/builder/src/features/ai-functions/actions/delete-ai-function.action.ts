"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteAIFunctionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action((props) => {
    const {
      bindArgsParsedInputs: [workspaceId, aiFunctionId],
    } = props

    return deleteAIFunction({ workspaceId, aiFunctionId })
  })

export const deleteAIFunction = async (ctx: {
  workspaceId: string
  aiFunctionId: string
}) => {
  await findOrFail({
    table: aiFunctionModel,
    where: {
      id: ctx.aiFunctionId,
      workspaceId: ctx.workspaceId,
    },
    message: `AIFunction with id ${ctx.aiFunctionId} not found`,
  })

  await db
    .delete(aiFunctionModel)
    .where(eq(aiFunctionModel.id, ctx.aiFunctionId))

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiFunctions`)
}
