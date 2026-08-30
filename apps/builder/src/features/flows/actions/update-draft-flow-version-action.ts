"use server"

import { flowVersionService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateDraftFlowVersionSchema } from "../schema/action"

export const updateDraftFlowVersionAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateDraftFlowVersionSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await flowVersionService.updateDraft({ workspaceId, id, data: parsedInput })
    return { ok: true as const }
  })
