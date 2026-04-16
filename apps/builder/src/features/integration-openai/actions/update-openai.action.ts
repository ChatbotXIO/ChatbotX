"use server"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationOpenaiModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateOpenAIRequest,
  updateOpenAIRequest,
} from "../schemas/request"

export const updateIntegrationOpenAIAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateOpenAIRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateIntegrationOpenAI({ workspaceId, id }, parsedInput)
  })

export const updateIntegrationOpenAI = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateOpenAIRequest,
) => {
  const integrationOpenAI = await findOrFail({
    table: integrationOpenaiModel,
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    message: "Integration OpenAI not found",
  })

  const result = await db
    .update(integrationOpenaiModel)
    .set(parsedInput)
    .where(eq(integrationOpenaiModel.id, integrationOpenAI.id))
    .returning()
    .then((result) => result[0])

  await aiIntegrationService.invalidateCache(ctx.workspaceId, "openai")

  return result
}
