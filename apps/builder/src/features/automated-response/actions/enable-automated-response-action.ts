"use server"

import { automatedResponseService } from "@chatbotx.io/business"
import {
  type AutomatedResponseType,
  automatedResponseTypes,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const enableRequest = z.object({
  status: z.boolean(),
})
type EnableRequest = z.infer<typeof enableRequest>

export const enableAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([
    zodBigintAsString(),
    zodBigintAsString(),
    automatedResponseTypes,
  ])
  .inputSchema(enableRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id, type],
      parsedInput,
    } = props

    return await enableAutomatedResponse({ workspaceId, id, type }, parsedInput)
  })

export const enableAutomatedResponse = async (
  ctx: { workspaceId: string; id: string; type: AutomatedResponseType },
  parsedInput: EnableRequest,
) => {
  await automatedResponseService.findOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
    type: ctx.type,
  })
  await automatedResponseService.setStatus(ctx, parsedInput.status)
}
