"use server"

import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { aiMCPServerModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { ChatbotXException } from "@/lib/errors/exception"
import { workspaceActionClient } from "@/lib/safe-action"
import { findAIMcpServerByName } from "../queries"
import {
  type UpdateAIMcpServerRequest,
  updateAIMcpServerRequest,
} from "../schema/action"

export const updateAIMcpServerAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAIMcpServerRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props
    const t = await getTranslations()

    const existing = await findAIMcpServerByName(workspaceId, parsedInput.name)

    if (existing && existing.id !== id) {
      throw new ChatbotXException(
        t("messages.nameAlreadyExists", {
          feature: t("fields.mcpServer.label"),
        }),
      )
    }

    return await updateAIMcpServer({ workspaceId, id }, parsedInput)
  })

export const updateAIMcpServer = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAIMcpServerRequest,
) => {
  const mcpServer = await findOrFail({
    table: aiMCPServerModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: `AIMcpServer with id ${ctx.id} not found`,
  })

  await db
    .update(aiMCPServerModel)
    .set(parsedInput)
    .where(eq(aiMCPServerModel.id, mcpServer.id))

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiMcpServers`)
}
