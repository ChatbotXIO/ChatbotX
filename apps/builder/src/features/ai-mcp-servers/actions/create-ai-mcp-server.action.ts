"use server"

import { db } from "@chatbotx.io/database/client"
import { aiMCPServerModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { returnValidationErrors } from "next-safe-action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { aiMcpServerService } from "../ai-mcp-server.service"
import { createAIMcpServerRequest } from "../schema/action"

export const createAIMcpServerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIMcpServerRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    const t = await getTranslations()

    const existing = await aiMcpServerService.findBy({
      where: { workspaceId, name: parsedInput.name },
    })
    if (existing) {
      return returnValidationErrors(createAIMcpServerRequest, {
        name: {
          _errors: [
            t("messages.nameAlreadyExists", {
              feature: t("fields.mcpServer.label"),
            }),
          ],
        },
      })
    }

    await db.insert(aiMCPServerModel).values({
      ...parsedInput,
      id: createId(),
      workspaceId,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#aiMcpServers`)
  })
