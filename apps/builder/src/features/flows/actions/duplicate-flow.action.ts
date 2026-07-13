"use server"

import { flowService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"

export const duplicateFlowAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(({ bindArgsParsedInputs: [workspaceId, id] }) =>
    flowService.duplicate({ workspaceId, id }),
  )
