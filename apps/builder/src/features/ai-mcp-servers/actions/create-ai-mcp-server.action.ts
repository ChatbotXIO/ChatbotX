"use server"

import { db } from "@chatbotx.io/database/client"
import { aiMCPServerModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAIMcpServerRequest } from "../schema/action"

export const createAIMcpServerAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIMcpServerRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await db.insert(aiMCPServerModel).values({
      ...parsedInput,
      id: createId(),
      workspaceId,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#aiMcpServers`)
  })
