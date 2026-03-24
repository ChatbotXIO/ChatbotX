"use server"

import { db, eq, findOrFail } from "@aha.chat/database/client"
import { sequenceModel, sequenceStepModel } from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import {
  type ChatbotIdRequestParams,
  chatbotIdRequestParams,
} from "@/features/common/schemas"
import {
  handleStepCreationImpact,
  handleStepUpdateImpact,
} from "@/features/contact-sequences/utils/calculate-next-run-at"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { chatbotActionClient } from "@/lib/safe-action"
import {
  type UpsertSequenceStepRequest,
  upsertSequenceStepRequest,
} from "../schema"

async function validateSequenceOwnership(
  sequenceId: string,
  chatbotId: string,
) {
  await findOrFail(
    sequenceModel,
    {
      id: sequenceId,
      chatbotId,
    },
    "Sequence not found",
  )
}

function buildUpdateData(
  parsedInput: UpsertSequenceStepRequest,
): Partial<typeof sequenceStepModel.$inferInsert> {
  const {
    order,
    delayDays,
    delayMinutes,
    delayUnit,
    flowId,
    specificDateTime,
    isActive,
    anytime,
    sendTimeStart,
    sendTimeEnd,
    sendDays,
  } = parsedInput

  return {
    order,
    ...(delayDays !== undefined && { delayDays }),
    ...(delayMinutes !== undefined && { delayMinutes }),
    ...(delayUnit !== undefined && { delayUnit }),
    ...(flowId !== undefined && { flowId }),
    ...(specificDateTime !== undefined && {
      specificDateTime: specificDateTime ? new Date(specificDateTime) : null,
    }),
    ...(isActive !== undefined && { isActive }),
    ...(anytime !== undefined && { anytime }),
    ...(sendTimeStart !== undefined && {
      sendTimeStart: sendTimeStart || null,
    }),
    ...(sendTimeEnd !== undefined && { sendTimeEnd: sendTimeEnd || null }),
    ...(sendDays !== undefined && {
      sendDays: sendDays ? JSON.stringify(sendDays) : null,
    }),
  }
}

function buildCreateData(
  parsedInput: UpsertSequenceStepRequest,
  sequenceId: string,
): typeof sequenceStepModel.$inferInsert {
  const {
    order,
    delayDays,
    delayMinutes,
    delayUnit,
    flowId,
    specificDateTime,
    isActive,
    anytime,
    sendTimeStart,
    sendTimeEnd,
    sendDays,
  } = parsedInput

  return {
    id: createId(),
    sequenceId,
    order,
    delayDays: delayDays ?? 1,
    delayMinutes: delayMinutes ?? 0,
    delayUnit: delayUnit ?? "days",
    flowId: flowId ?? null,
    specificDateTime: specificDateTime ? new Date(specificDateTime) : null,
    isActive: isActive ?? true,
    anytime: anytime ?? true,
    sendTimeStart: sendTimeStart || null,
    sendTimeEnd: sendTimeEnd || null,
    sendDays: sendDays ? JSON.stringify(sendDays) : null,
  }
}

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
): boolean {
  const { delayDays, delayMinutes, delayUnit, isActive, order } = parsedInput

  return (
    delayDays !== undefined ||
    delayMinutes !== undefined ||
    delayUnit !== undefined ||
    isActive !== undefined ||
    order !== undefined
  )
}

/**
 * Handle step CREATION logic.
 *
 * FLOW:
 * 1. Create new step in database
 * 2. Recalculate schedules for affected contacts
 * 3. Return stepId
 *
 * AFFECTED CONTACTS:
 * Contacts with currentStep <= newStepOrder
 *    → They will reach this step in the future
 *    → nextRunAt needs recalculation to include new step's delay
 *
 * NOT AFFECTED:
 * Contacts with currentStep > newStepOrder
 *    → Already passed this step, won't go back
 * Completed contacts (status='completed')
 *    → Already finished sequence, no impact
 *
 * EXAMPLE:
 * Sequence has steps: [0, 1, 2, 4, 5]
 * Admin creates new step order=3
 *
 * Contact A (currentStep=2):
 *   - Will reach new step 3 → nextRunAt needs update
 *
 * Contact B (currentStep=5):
 *   - Already passed step 3 → no impact
 */
async function handleStepCreation(
  parsedInput: UpsertSequenceStepRequest,
  sequenceId: string,
  chatbotId: string,
): Promise<{ stepId: string }> {
  const createData = buildCreateData(parsedInput, sequenceId)
  const step = await createSequenceStep(createData)

  // Recalculate only for affected contacts (currentStep <= newStepOrder)
  // More efficient than recalculating all contacts
  await handleStepCreationImpact(sequenceId, chatbotId, parsedInput.order)

  return { stepId: step.id }
}

/**
 * Handle step UPDATE logic.
 *
 * FLOW:
 * 1. Update step in database
 * 2. Check if recalculation is needed (shouldRecalculateOnUpdate)
 * 3. If needed: recalculate schedules for affected contacts
 * 4. Return stepId
 *
 * WHEN TO RECALCULATE:
 * Update delay (delayDays/delayMinutes/delayUnit)
 *    → Timing changes → contacts need new nextRunAt
 * Update isActive (true ↔ false)
 *    → Step becomes available/unavailable → contacts skip or process
 * Update order
 *    → Step position changes → timeline changes
 *
 * WHEN NOT TO RECALCULATE:
 * Update flowId
 *    → Only changes message content, does not affect schedule
 * Update sendTime/sendDays/anytime
 *    → Only affects worker dispatch logic, does not affect nextRunAt
 *
 * AFFECTED CONTACTS (when recalculating):
 * GROUP 1: Contacts waiting for this step (nextStepId = stepId)
 *   → Update directly impacts them
 *
 * GROUP 2: Contacts at earlier steps (currentStep < stepOrder)
 *   → Will reach this step later → cumulative delay changes
 *
 * NOT AFFECTED:
 * Contacts past this step (currentStep > stepOrder)
 *    → Already passed, won't go back
 * Completed contacts (status='completed')
 *    → Already finished, no impact
 *
 * EXAMPLES:
 *
 * Example 1: Update delay of step 3 (1 day → 3 days)
 *   Contact A (currentStep=2, nextStepId=step3.id):
 *     → nextRunAt: tomorrow → 3 days later
 *
 * Example 2: Disable step 3 (isActive: true → false)
 *   Contact B (currentStep=2, nextStepId=step3.id):
 *     → nextStepId: step3.id → step4.id (next active)
 *
 * Example 3: Update flowId of step 3
 *   Contact C (currentStep=2, nextStepId=step3.id):
 *     → No recalculate → nextRunAt unchanged, only message content changes
 *
 * Example 4: Update step 3, contact already at step 5
 *   Contact D (currentStep=5):
 *     → Skip → already passed step 3
 */
async function handleStepUpdate(
  parsedInput: UpsertSequenceStepRequest,
  stepId: string,
  sequenceId: string,
  chatbotId: string,
): Promise<{ stepId: string }> {
  const updateData = buildUpdateData(parsedInput)
  const step = await updateSequenceStep(stepId, updateData, chatbotId)

  // Only recalculate if changes affect scheduling
  if (shouldRecalculateOnUpdate(parsedInput)) {
    // Use targeted recalculation based on updated step
    // Recalculate for:
    // - GROUP 1: Contacts waiting for this step (nextStepId = stepId)
    // - GROUP 2: Contacts at earlier steps (currentStep < stepOrder)
    // NOT affected:
    // - Contacts past this step (currentStep > stepOrder)
    // - Completed contacts (status = 'completed')
    await handleStepUpdateImpact(
      sequenceId,
      chatbotId,
      stepId,
      parsedInput.order,
    )
  }

  return { stepId: step.id }
}

async function updateSequenceStep(
  stepId: string,
  updateData: Partial<typeof sequenceStepModel.$inferInsert>,
  chatbotId: string,
) {
  const step = await db.query.sequenceStepModel.findFirst({
    where: {
      id: stepId,
    },
    with: {
      sequence: true,
    },
  })

  if (!step) {
    throw new Error("Step not found")
  }

  if (step.sequence.chatbotId !== chatbotId) {
    throw new Error("Unauthorized: Step does not belong to this chatbot")
  }

  const [updated] = await db
    .update(sequenceStepModel)
    .set(updateData)
    .where(eq(sequenceStepModel.id, stepId))
    .returning()

  return updated
}

async function createSequenceStep(
  createData: typeof sequenceStepModel.$inferInsert,
) {
  const [created] = await db
    .insert(sequenceStepModel)
    .values(createData)
    .returning()

  return created
}

export const upsertSequenceStepAction = chatbotActionClient
  .bindArgsSchemas(chatbotIdRequestParams)
  .inputSchema(upsertSequenceStepRequest)
  .action(
    async ({
      bindArgsParsedInputs: [chatbotId],
      parsedInput,
    }: {
      bindArgsParsedInputs: ChatbotIdRequestParams
      parsedInput: UpsertSequenceStepRequest
    }) => {
      const { stepId, sequenceId } = parsedInput

      await validateSequenceOwnership(sequenceId, chatbotId)

      let result: { stepId: string }

      if (stepId) {
        result = await handleStepUpdate(
          parsedInput,
          stepId,
          sequenceId,
          chatbotId,
        )
      } else {
        result = await handleStepCreation(parsedInput, sequenceId, chatbotId)
      }

      revalidateCacheTags([`chatbots:${chatbotId}#sequences`])

      return result
    },
  )
