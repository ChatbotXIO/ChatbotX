"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiMcpServerService } from "../ai-mcp-server.service"

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
  const t = await getTranslations()

  const mcpServer = await aiMcpServerService.findBy({
    where: {
      id: ctx.aiMcpServerId,
      workspaceId: ctx.workspaceId,
    },
  })
  if (!mcpServer) {
    throw notFoundException(
      t("messages.featureNotFound", { feature: "AIMcpServer" }),
    )
  }

  await aiMcpServerService.delete(ctx.aiMcpServerId)
}
