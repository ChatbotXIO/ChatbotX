"use server"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { integrationOpenAIService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateOpenAIRequest,
  updateOpenAIRequest,
} from "../schema/request"

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
  const result = await integrationOpenAIService.update(ctx, parsedInput)

  await aiIntegrationService.invalidateCache(ctx.workspaceId, "openai")

  return result
}
