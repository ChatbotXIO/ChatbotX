"use server"

import { sequenceService } from "@chatbotx.io/business/sequence"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

const deleteSequenceStepRequest = z.object({
  stepId: zodBigintAsString(),
  sequenceId: zodBigintAsString(),
})

type DeleteSequenceStepRequest = z.infer<typeof deleteSequenceStepRequest>

export const deleteSequenceStepAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteSequenceStepRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: DeleteSequenceStepRequest
    }) => {
      const { stepId, sequenceId } = parsedInput

      await sequenceService.assertOwned({ workspaceId, sequenceId })
      await sequenceService.deleteStep({ workspaceId, stepId })

      return { success: true }
    },
  )
