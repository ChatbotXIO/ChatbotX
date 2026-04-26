"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiMCPServerModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteAIMcpServerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action((props) => {
    const {
      bindArgsParsedInputs: [workspaceId, aiMcpServerId],
    } = props

    return deleteAIMcpServer({ workspaceId, aiMcpServerId })
  })

export const deleteAIMcpServer = async (ctx: {
  workspaceId: string
  aiMcpServerId: string
}) => {
  await findOrFail({
    table: aiMCPServerModel,
    where: {
      id: ctx.aiMcpServerId,
      workspaceId: ctx.workspaceId,
    },
    message: `AIMcpServer with id ${ctx.aiMcpServerId} not found`,
  })

  await db
    .delete(aiMCPServerModel)
    .where(eq(aiMCPServerModel.id, ctx.aiMcpServerId))

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiMcpServers`)
}
