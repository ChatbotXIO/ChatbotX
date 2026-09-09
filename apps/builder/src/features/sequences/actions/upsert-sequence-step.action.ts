"use server"

import { sequenceService } from "@chatbotx.io/business/sequence"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpsertSequenceStepRequest,
  upsertSequenceStepRequest,
} from "../schema/action"

export const upsertSequenceStepAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(upsertSequenceStepRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: UpsertSequenceStepRequest
    }) => {
      const { stepId, sequenceId } = parsedInput

      await sequenceService.assertOwned({ workspaceId, sequenceId })

      return await sequenceService.upsertStep({
        workspaceId,
        sequenceId,
        stepId,
        data: parsedInput,
      })
    },
  )
