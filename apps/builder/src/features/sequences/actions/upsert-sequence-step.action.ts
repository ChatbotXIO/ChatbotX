"use server"

import { sequenceService } from "@chatbotx.io/business"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schema"
import {
  handleStepCreationImpact,
  handleStepUpdateImpact,
} from "@/features/contact-sequences/utils/calculate-next-run-at"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpsertSequenceStepRequest,
  upsertSequenceStepRequest,
} from "../schema/action"

/**
 * Check if we need to recalculate contact schedules when UPDATING a step.
 *
 * RECALCULATE when these fields change:
 * delayDays/delayMinutes/delayUnit: Changes step timing
 * isActive: Step becomes available/unavailable → contacts skip or process
 * order: Step position changes → affects timeline
 *
 * NO RECALCULATE when these fields change:
 * flowId: Only changes message content, does not affect schedule
 * sendTimeStart/sendTimeEnd: Only affects worker dispatch time
 * sendDays: Only affects worker dispatch days
 * anytime: Only affects worker dispatch logic
 * specificDateTime: Handled within recalculation logic
 */
function shouldRecalculateOnUpdate(
  parsedInput: UpsertSequenceStepRequest,
  previousOrder: number,
): boolean {
  const { delayDays, delayMinutes, delayUnit, isActive, order } = parsedInput

  return (
    delayDays !== undefined ||
    delayMinutes !== undefined ||
    delayUnit !== undefined ||
    isActive !== undefined ||
    order !== previousOrder
  )
}

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

      if (stepId) {
        const { previousOrder, step } = await sequenceService.updateStep({
          workspaceId,
          stepId,
          data: parsedInput,
        })

        if (shouldRecalculateOnUpdate(parsedInput, previousOrder)) {
          await handleStepUpdateImpact(
            sequenceId,
            workspaceId,
            stepId,
            parsedInput.order,
          )
        }

        return { stepId: step.id }
      }

      const step = await sequenceService.createStep({
        workspaceId,
        sequenceId,
        data: parsedInput,
      })

      await handleStepCreationImpact(sequenceId, workspaceId, parsedInput.order)

      return { stepId: step.id }
    },
  )
