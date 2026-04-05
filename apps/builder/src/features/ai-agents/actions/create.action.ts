"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { aiAgentModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { createAIAgentRequest } from "@/features/ai-agents/schemas/action"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const createAIAgentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAIAgentRequest)
  .action(async (props) => {
    const {
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    } = props

    await db.transaction(async (tx) => {
      // Reset isDefault to false for all other agents
      if (parsedInput.isDefault) {
        await tx
          .update(aiAgentModel)
          .set({
            isDefault: false,
          })
          .where(eq(aiAgentModel.workspaceId, workspaceId))
      }

      await tx.insert(aiAgentModel).values({
        ...parsedInput,
        workspaceId,
        id: createId(),
      })
    })

    revalidateCacheTags(`workspaces:${workspaceId}#aiAgents`)
  })
