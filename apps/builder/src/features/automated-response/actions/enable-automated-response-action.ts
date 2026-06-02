"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceActionClient } from "@/lib/safe-action"
import { automatedResponseService } from "../automated-response.service"

const enableRequest = z.object({
  status: z.boolean(),
})
type EnableRequest = z.infer<typeof enableRequest>

export const enableAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(enableRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await enableAutomatedResponse({ workspaceId, id }, parsedInput)
  })

export const enableAutomatedResponse = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: EnableRequest,
) => {
  await automatedResponseService.findOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
  })
  await automatedResponseService.setStatus(ctx, parsedInput.status)
}
