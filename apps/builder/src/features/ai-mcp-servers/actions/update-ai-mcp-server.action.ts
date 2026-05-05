"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiMcpServerService } from "../ai-mcp-server.service"
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

    return await updateAIMcpServer({ workspaceId, id }, parsedInput)
  })

export const updateAIMcpServer = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAIMcpServerRequest,
) => {
  const t = await getTranslations()

  const mcpServer = await aiMcpServerService.findBy({
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
  })
  if (!mcpServer) {
    throw notFoundException(
      t("messages.featureNotFound", { feature: "AIMcpServer" }),
    )
  }

  const existing = await aiMcpServerService.findBy({
    where: {
      workspaceId: ctx.workspaceId,
      name: parsedInput.name,
    },
  })
  if (existing && existing.id !== mcpServer.id) {
    return returnValidationErrors(updateAIMcpServerRequest, {
      name: {
        _errors: [
          t("messages.nameAlreadyExists", {
            feature: t("fields.mcpServer.label"),
          }),
        ],
      },
    })
  }

  await aiMcpServerService.update(mcpServer.id, parsedInput)

  revalidateCacheTags(`workspaces:${ctx.workspaceId}#aiMcpServers`)
}
