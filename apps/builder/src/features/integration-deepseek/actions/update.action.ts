"use server"

import { aiProviders } from "@chatbotx.io/ai"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationDeepseekModel } from "@chatbotx.io/database/schema"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateDeepSeekRequest,
  updateDeepSeekRequest,
} from "../schemas/request"

export const updateIntegrationDeepSeekAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(updateDeepSeekRequest)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId],
    }: {
      parsedInput: UpdateDeepSeekRequest
      bindArgsParsedInputs: WorkspaceIdRequestParams
    }) => {
      const integrationDeepseek = await findOrFail({
        table: integrationDeepseekModel,
        where: { workspaceId },
        message: "Integration DeepSeek not found",
      })

      await db
        .update(integrationDeepseekModel)
        .set(parsedInput)
        .where(eq(integrationDeepseekModel.id, integrationDeepseek.id))

      await aiIntegrationService.invalidateCache(
        workspaceId,
        aiProviders.enum.deepseek,
      )
    },
  )
