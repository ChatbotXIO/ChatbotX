"use server"

import { sequenceService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { recalculateAllContactsInSequence } from "@/features/contact-sequences/utils/calculate-next-run-at"
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
      await recalculateAllContactsInSequence(sequenceId, workspaceId)

      return { success: true }
    },
  )
