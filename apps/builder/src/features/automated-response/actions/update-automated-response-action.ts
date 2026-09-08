"use server"

import {
  automatedResponseService,
  type UpdateAutomatedResponseRequest,
} from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateAutomatedResponseRequest } from "../schema/action"

export const updateAutomatedResponseAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateAutomatedResponseRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateAutomatedResponse({ workspaceId, id }, parsedInput)
  })

export const updateAutomatedResponse = async (
  ctx: { workspaceId: string; id: string },
  parsedInput: UpdateAutomatedResponseRequest,
) => {
  await automatedResponseService.findOrFail({
    workspaceId: ctx.workspaceId,
    id: ctx.id,
  })

  // `text`/`flowId` mutual-exclusion and cross-workspace `flowId`
  // validation now live in `automatedResponseService.update` so every
  // caller (this action and the public API) gets the same invariants.
  await automatedResponseService.update(ctx, parsedInput)
}
