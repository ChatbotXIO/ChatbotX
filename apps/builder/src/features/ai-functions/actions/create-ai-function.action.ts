"use server"

import { db } from "@chatbotx.io/database/client"
import { aiFunctionModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAIFunctionRequest } from "../schema/action"

export const createAIFunctionAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIFunctionRequest)
  .action(async ({ bindArgsParsedInputs, parsedInput }) => {
    const [workspaceId] = bindArgsParsedInputs

    await db.insert(aiFunctionModel).values({
      ...parsedInput,
      id: createId(),
      workspaceId,
    })

    revalidateCacheTags(`workspaces:${workspaceId}#aiFunctions`)
  })
