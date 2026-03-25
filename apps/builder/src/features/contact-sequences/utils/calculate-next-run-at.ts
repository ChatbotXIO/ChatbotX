import {
  and,
  type DatabaseClient,
  db,
  eq,
  isNull,
  lte,
  sql,
} from "@aha.chat/database/client"
import { contactsOnSequenceModel } from "@aha.chat/database/schema"
import { getDragonflyClient } from "@aha.chat/scheduler"
import { createDispatch } from "@aha.chat/sequence-scheduler"

type SequenceStepForDelay = {
  id: string
  order: number
  sequenceId?: string
  delayDays: number
  delayMinutes: number
  delayUnit: string | null
  specificDateTime: Date | null
}

type ContactForRecalculation = {
  id: string
  contactId: string
  currentStep: number
  enrolledAt: Date
}

// Chunk size for batch processing to prevent timeout
const RECALCULATION_CHUNK_SIZE = 500

/**
 * Helper function to create and schedule a dispatch for a contact
 */
async function createAndScheduleDispatch(
  params: {
    chatbotId: string
    sequenceId: string
    contactId: string
    stepId: string
    enrollmentId: string
    runAt: Date
  },
  client: DatabaseClient,
) {
  const dispatch = await createDispatch({
    ...params,
    client,
  })

  const dragonfly = getDragonflyClient()
  await dragonfly.addToSchedule(dispatch.bucket, dispatch.id, dispatch.runAtMs)
}

export async function calculateNextRunAtBulk(
  sequenceIds: string[],
  enrolledAt: Date = new Date(),
  tx?: DatabaseClient,
): Promise<Map<string, { nextRunAt: Date; nextStepId: string | null }>> {
  const client = tx ?? db

  const firstSteps = await client.query.sequenceStepModel.findMany({
    where: {
      sequenceId: { in: sequenceIds },
      order: 0,
      isActive: true,
    },
    columns: {
      id: true,
      sequenceId: true,
      delayDays: true,
      delayMinutes: true,
      delayUnit: true,
      specificDateTime: true,
    },
  })

  const stepMap = new Map(firstSteps.map((step) => [step.sequenceId, step]))

  const resultMap = new Map<
    string,
    { nextRunAt: Date; nextStepId: string | null }
  >()
  for (const sequenceId of sequenceIds) {
    const step = stepMap.get(sequenceId)
    if (!step) {
      resultMap.set(sequenceId, { nextRunAt: enrolledAt, nextStepId: null })
      continue
    }

    if (step.delayUnit === "specificTime" && step.specificDateTime) {
      resultMap.set(sequenceId, {
        nextRunAt: step.specificDateTime,
        nextStepId: step.id,
      })
      continue
    }

    const delayMs =
      step.delayDays * 24 * 60 * 60 * 1000 + step.delayMinutes * 60 * 1000
    resultMap.set(sequenceId, {
      nextRunAt:
        delayMs > 0 ? new Date(enrolledAt.getTime() + delayMs) : enrolledAt,
      nextStepId: step.id,
    })
  }

  return resultMap
}

function calculateDelayInMs(delayDays: number, delayMinutes: number): number {
  return delayDays * 24 * 60 * 60 * 1000 + delayMinutes * 60 * 1000
}

async function getActiveStepsForSequence(
  sequenceId: string,
  client: DatabaseClient,
): Promise<SequenceStepForDelay[]> {
  return await client.query.sequenceStepModel.findMany({
    where: {
      sequenceId,
      isActive: true,
    },
    orderBy: {
      order: "asc",
    },
    columns: {
      id: true,
      order: true,
      delayDays: true,
      delayMinutes: true,
      delayUnit: true,
      specificDateTime: true,
    },
  })
}

async function getActiveStepsCumulativeDelay(
  sequenceId: string,
  upToOrder: number,
  client: DatabaseClient,
): Promise<number | Date> {
  const steps = await getActiveStepsForSequence(sequenceId, client)

  if (steps.length === 0) {
    return -1
  }

  const stepsUpToTarget = steps.filter((s) => s.order <= upToOrder)

  if (stepsUpToTarget.length === 0) {
    return -1
  }

  const targetStep = stepsUpToTarget.at(-1)

  if (
    targetStep &&
    targetStep.delayUnit === "specificTime" &&
    targetStep.specificDateTime
  ) {
    return targetStep.specificDateTime
  }

  let totalDelayMs = 0
  for (const step of stepsUpToTarget) {
    totalDelayMs += calculateDelayInMs(step.delayDays, step.delayMinutes)
  }

  return totalDelayMs
}

async function getNextActiveStep(
  sequenceId: string,
  fromOrder: number,
  client: DatabaseClient,
): Promise<{ id: string; order: number } | null> {
  const nextStep = await client.query.sequenceStepModel.findFirst({
    where: {
      sequenceId,
      order: { gte: fromOrder },
      isActive: true,
    },
    orderBy: {
      order: "asc",
    },
    columns: { id: true, order: true },
  })
  return nextStep ?? null
}

type UpdateContactsNextRunAtParams = {
  sequenceId: string
  chatbotId: string
  currentStepOrder: number
  delayMsOrDate: number | Date
  nextStepId: string | null
  client: DatabaseClient
}

async function updateContactsNextRunAt(params: UpdateContactsNextRunAtParams) {
  const {
    sequenceId,
    chatbotId,
    currentStepOrder,
    delayMsOrDate,
    nextStepId,
    client,
  } = params

  const whereCondition = and(
    eq(contactsOnSequenceModel.sequenceId, sequenceId),
    eq(contactsOnSequenceModel.chatbotId, chatbotId),
    eq(contactsOnSequenceModel.currentStep, currentStepOrder),
    eq(contactsOnSequenceModel.status, "active"),
    isNull(contactsOnSequenceModel.completedAt),
  )

  if (delayMsOrDate === -1) {
    await client
      .update(contactsOnSequenceModel)
      .set({
        nextRunAt: null,
        nextStepId,
        updatedAt: new Date(),
      })
      .where(whereCondition)
  } else if (delayMsOrDate instanceof Date) {
    await client
      .update(contactsOnSequenceModel)
      .set({
        nextRunAt: delayMsOrDate,
        nextStepId,
        updatedAt: new Date(),
      })
      .where(whereCondition)
  } else {
    await client
      .update(contactsOnSequenceModel)
      .set({
        nextRunAt: sql`NOW() + INTERVAL '${sql.raw(String(delayMsOrDate))} milliseconds'`,
        nextStepId,
        updatedAt: new Date(),
      })
      .where(whereCondition)
  }
}

async function recalculateNextRunAtForStep(
  sequenceId: string,
  chatbotId: string,
  stepOrder: number,
  client: DatabaseClient,
) {
  // Find the NEXT active step after currentStep
  // Contact is at stepOrder, so we need to find the next step they will run
  // Use order > stepOrder (not >=) to get the NEXT step, not current step
  const nextActiveStep = await getNextActiveStep(
    sequenceId,
    stepOrder + 1, // Start from NEXT order, not current
    client,
  )

  // If no next active step exists, mark contacts as COMPLETED
  // They have finished all available steps in the sequence
  if (nextActiveStep === null) {
    await client
      .update(contactsOnSequenceModel)
      .set({
        status: "completed",
        completedAt: new Date(),
        nextRunAt: null,
        nextStepId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactsOnSequenceModel.sequenceId, sequenceId),
          eq(contactsOnSequenceModel.chatbotId, chatbotId),
          eq(contactsOnSequenceModel.currentStep, stepOrder),
          eq(contactsOnSequenceModel.status, "active"),
          isNull(contactsOnSequenceModel.completedAt),
        ),
      )
    return
  }

  // Calculate cumulative delay from start to the next step
  const cumulativeDelay = await getActiveStepsCumulativeDelay(
    sequenceId,
    nextActiveStep.order,
    client,
  )

  // Update contacts at this currentStep position
  await updateContactsNextRunAt({
    sequenceId,
    chatbotId,
    currentStepOrder: stepOrder,
    delayMsOrDate: cumulativeDelay,
    nextStepId: nextActiveStep.id,
    client,
  })
}

/**
 * Recalculate schedules for all active contacts in a sequence.
 * This is called when steps are added, updated, or deleted.
 *
 * Handles:
 * - Active contacts (status='active', completedAt=null): recalculate nextRunAt
 * - Completed contacts (status='completed' or completedAt!=null): no changes
 * - Contacts at different currentStep positions: each gets appropriate nextRunAt
 */
export async function recalculateAllContactsInSequence(
  sequenceId: string,
  chatbotId: string,
  tx?: DatabaseClient,
) {
  const client = tx ?? db

  // Only recalculate for active, non-completed contacts
  // Completed contacts remain finished and are not affected by step changes
  const uniqueSteps = await client
    .selectDistinct({ currentStep: contactsOnSequenceModel.currentStep })
    .from(contactsOnSequenceModel)
    .where(
      and(
        eq(contactsOnSequenceModel.sequenceId, sequenceId),
        eq(contactsOnSequenceModel.chatbotId, chatbotId),
        eq(contactsOnSequenceModel.status, "active"),
        isNull(contactsOnSequenceModel.completedAt),
      ),
    )

  // Recalculate for each unique currentStep position
  // This handles contacts at different stages of the sequence
  for (const { currentStep } of uniqueSteps) {
    await recalculateNextRunAtForStep(
      sequenceId,
      chatbotId,
      currentStep,
      client,
    )
  }
}

/**
 * Reactivate completed contacts when a new step is added after their completion point.
 *
 * IMPORTANT: currentStep represents the NEXT step order to process (0-based)
 * - When contact enrolls: currentStep=0 (will process step order=0)
 * - After processing step order=0: currentStep=1 (will process step order=1)
 * - After processing step order=2 (last step): currentStep=3 (completed, no step order=3)
 *
 * SCENARIO:
 * - Contact completed with currentStep=3 (processed steps 0,1,2)
 * - Admin creates new step order=3
 * - Contact should be reactivated to process the new step order=3
 *
 * LOGIC:
 * 1. Find completed contacts where currentStep <= newStepOrder
 * 2. Fetch all active steps once (optimization)
 * 3. For each contact, find next step with order >= currentStep
 * 4. Calculate nextStepId and nextRunAt
 * 5. Update status='active', completedAt=null
 * 6. Process in chunks to prevent timeout
 */
async function reactivateCompletedContactsForNewStep(
  sequenceId: string,
  chatbotId: string,
  newStepOrder: number,
  client: DatabaseClient,
) {
  // Find completed contacts that can process the new step
  // currentStep represents NEXT step to process, so:
  // - If currentStep=3 and newStepOrder=3, contact should process it (3 <= 3) ✅
  // - If currentStep=5 and newStepOrder=3, contact already passed it (5 > 3) ❌
  const completedContacts = await client.query.contactsOnSequenceModel.findMany(
    {
      where: {
        sequenceId,
        chatbotId,
        status: "completed",
        currentStep: { lte: newStepOrder },
      },
      columns: {
        id: true,
        contactId: true,
        currentStep: true,
        enrolledAt: true,
      },
    },
  )

  if (completedContacts.length === 0) {
    return
  }

  // OPTIMIZATION: Fetch active steps once instead of in loop
  const activeSteps = await getActiveStepsForSequence(sequenceId, client)

  if (activeSteps.length === 0) {
    // No active steps, keep contacts completed
    return
  }

  // Process in chunks to prevent timeout
  for (let i = 0; i < completedContacts.length; i += RECALCULATION_CHUNK_SIZE) {
    const chunk = completedContacts.slice(i, i + RECALCULATION_CHUNK_SIZE)

    // Process chunk in parallel
    await Promise.all(
      chunk.map(async (contact: ContactForRecalculation) => {
        // Find the next active step at or after currentStep
        // currentStep represents the NEXT step order to process
        // Use >= because if currentStep=3, we want to find step with order=3
        const nextActiveStep = activeSteps.find(
          (step) => step.order >= contact.currentStep,
        )

        if (!nextActiveStep) {
          // No next step available, keep them completed
          return
        }

        // Calculate cumulative delay to the next step
        // Filter steps up to target order (0-based)
        const stepsUpToTarget = activeSteps.filter(
          (s) => s.order <= nextActiveStep.order,
        )

        // Check for specificDateTime
        const targetStep = stepsUpToTarget.at(-1)
        let nextRunAt: Date | null = null

        if (
          targetStep?.delayUnit === "specificTime" &&
          targetStep.specificDateTime
        ) {
          nextRunAt = targetStep.specificDateTime
        } else {
          // Calculate cumulative delay
          let totalDelayMs = 0
          for (const step of stepsUpToTarget) {
            totalDelayMs += calculateDelayInMs(
              step.delayDays,
              step.delayMinutes,
            )
          }

          if (totalDelayMs > 0) {
            nextRunAt = new Date(contact.enrolledAt.getTime() + totalDelayMs)
          }
        }

        // Reactivate the contact
        await client
          .update(contactsOnSequenceModel)
          .set({
            status: "active",
            completedAt: null,
            nextStepId: nextActiveStep.id,
            nextRunAt,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(contactsOnSequenceModel.id, contact.id),
              eq(contactsOnSequenceModel.chatbotId, chatbotId),
            ),
          )

        // Create and schedule dispatch for the reactivated contact
        if (nextRunAt) {
          await createAndScheduleDispatch(
            {
              chatbotId,
              sequenceId,
              contactId: contact.contactId,
              stepId: nextActiveStep.id,
              enrollmentId: contact.id,
              runAt: nextRunAt,
            },
            client,
          )
        }
      }),
    )
  }
}

/**
 * Handle step CREATION impact on contacts.
 *
 * SCENARIOS:
 *
 * Case 1: Contact at step 2, create new step order=5 (0-based: 3rd vs 6th step)
 *   - Contact currentStep=2 < newStepOrder=5
 *   - ✅ RECALCULATE: Contact will reach step 5 in the future
 *   - nextRunAt needs recalculation to include new step 5's delay
 *
 * Case 2: Contact at step 7, create new step order=5 (0-based: 8th vs 6th step)
 *   - Contact currentStep=7 > newStepOrder=5
 *   - ❌ SKIP: Contact already passed step 5, won't go back
 *   - No impact on this contact
 *
 * Case 3: Contact at step 5, create new step order=5 (0-based: same position)
 *   - Contact currentStep=5 = newStepOrder=5
 *   - ✅ RECALCULATE: New step may change timeline
 *   - Need to recalculate nextRunAt for this contact
 *
 * Case 4: Contact status='completed', currentStep <= newStepOrder (0-based)
 *   - ✅ REACTIVATE: Contact finished at step 4, new step 5 added
 *   - Change status to 'active', set completedAt=null
 *   - Calculate nextRunAt for new step
 *
 * Case 5: Contact status='paused' or 'cancelled'
 *   - ❌ SKIP: Only process active and completed contacts
 */
export async function handleStepCreationImpact(
  sequenceId: string,
  chatbotId: string,
  newStepOrder: number,
  tx?: DatabaseClient,
) {
  const client = tx ?? db

  // PART 1: Handle ACTIVE contacts
  // Query: Get all active contacts AFFECTED by the new step
  // Conditions:
  // 1. status = 'active' AND completedAt IS NULL (only active contacts)
  // 2. currentStep <= newStepOrder (haven't passed new step or currently at new step)
  //    Note: Order is 0-based, so step 0 is the first step
  const affectedSteps = await client
    .selectDistinct({ currentStep: contactsOnSequenceModel.currentStep })
    .from(contactsOnSequenceModel)
    .where(
      and(
        eq(contactsOnSequenceModel.sequenceId, sequenceId),
        eq(contactsOnSequenceModel.chatbotId, chatbotId),
        eq(contactsOnSequenceModel.status, "active"),
        isNull(contactsOnSequenceModel.completedAt),
        lte(contactsOnSequenceModel.currentStep, newStepOrder),
      ),
    )

  // Recalculate nextRunAt for each affected currentStep position (0-based)
  // Use Promise.all for parallel processing to improve performance
  await Promise.all(
    affectedSteps.map(({ currentStep }) =>
      recalculateNextRunAtForStep(sequenceId, chatbotId, currentStep, client),
    ),
  )

  // PART 2: Handle COMPLETED contacts
  // When a new step is added AFTER a contact's completion point,
  // we need to REACTIVATE them so they can continue the sequence
  // Example: Contact completed at step 4, admin adds step 5 → reactivate
  await reactivateCompletedContactsForNewStep(
    sequenceId,
    chatbotId,
    newStepOrder,
    client,
  )
}

/**
 * Handle step UPDATE impact on contacts.
 *
 * SCENARIOS:
 *
 * Case 1: Update delay of step 3 (1 day → 3 days)
 *   - Contact A: currentStep=2, nextStepId=step3.id, nextRunAt=tomorrow
 *   - ✅ RECALCULATE: Contact is waiting for step 3
 *   - nextRunAt: tomorrow → 3 days later
 *
 * Case 2: Update delay of step 5
 *   - Contact B: currentStep=2, nextStepId=step3.id
 *   - ✅ RECALCULATE: Contact will reach step 5 later
 *   - Cumulative delay changes, need to recalculate timeline
 *
 * Case 3: Disable step 3 (isActive: true → false)
 *   - Contact C: currentStep=2, nextStepId=step3.id
 *   - ✅ RECALCULATE: Step 3 is no longer active
 *   - nextStepId → step4.id (next active step)
 *
 * Case 4: Enable step 3 (isActive: false → true)
 *   - Contact D: currentStep=2, nextStepId=step4.id
 *   - ✅ RECALCULATE: Step 3 is now available
 *   - nextStepId may → step3.id (if step 3 is next active)
 *
 * Case 5: Update step 7, contact currently at step 2
 *   - Contact E: currentStep=2 < updatedStepOrder=7
 *   - ✅ RECALCULATE: Contact will reach step 7 in the future
 *
 * Case 6: Update step 3, contact already at step 8
 *   - Contact F: currentStep=8 > updatedStepOrder=3
 *   - ❌ SKIP: Contact already passed step 3
 *
 * Case 7: Update flowId of step (does not affect scheduling)
 *   - ❌ THIS FUNCTION IS NOT CALLED
 *   - shouldRecalculateOnUpdate() = false
 *
 * Case 8: Contact status='completed', currentStep < updatedStepOrder
 *   - ✅ REACTIVATE: If step is enabled or reordered after completion
 *   - Example: Contact completed at step 4, enable step 5 → reactivate
 */
export async function handleStepUpdateImpact(
  sequenceId: string,
  chatbotId: string,
  updatedStepId: string,
  updatedStepOrder: number,
  tx?: DatabaseClient,
) {
  const client = tx ?? db

  // PART 1: Handle ACTIVE contacts
  // GROUP 1: Contacts WAITING FOR this step (nextStepId = updatedStepId)
  // Example: Contact at step 2, nextStepId = step3.id
  //          → Update step 3 → need immediate recalculation
  const contactsWaitingForStep = await client
    .selectDistinct({ currentStep: contactsOnSequenceModel.currentStep })
    .from(contactsOnSequenceModel)
    .where(
      and(
        eq(contactsOnSequenceModel.sequenceId, sequenceId),
        eq(contactsOnSequenceModel.chatbotId, chatbotId),
        eq(contactsOnSequenceModel.status, "active"),
        isNull(contactsOnSequenceModel.completedAt),
        eq(contactsOnSequenceModel.nextStepId, updatedStepId),
      ),
    )

  // GROUP 2: Contacts at EARLIER STEPS (currentStep < updatedStepOrder)
  // Example: Contact at step 2, update step 5
  //          → Contact will reach step 5 later → need recalculation
  // Reason: Cumulative delay from step 2 → step 5 may change
  const contactsBeforeStep = await client
    .selectDistinct({ currentStep: contactsOnSequenceModel.currentStep })
    .from(contactsOnSequenceModel)
    .where(
      and(
        eq(contactsOnSequenceModel.sequenceId, sequenceId),
        eq(contactsOnSequenceModel.chatbotId, chatbotId),
        eq(contactsOnSequenceModel.status, "active"),
        isNull(contactsOnSequenceModel.completedAt),
        sql`${contactsOnSequenceModel.currentStep} < ${updatedStepOrder}`,
      ),
    )

  // Merge 2 groups and deduplicate
  // Example: Contact at step 2 may be in both GROUP 1 (nextStepId=step3.id)
  //          and GROUP 2 (currentStep < updatedStepOrder)
  //          → Only recalculate once
  const allAffectedSteps = [
    ...contactsWaitingForStep,
    ...contactsBeforeStep,
  ].reduce(
    (acc, { currentStep }) => {
      if (!acc.some((s) => s.currentStep === currentStep)) {
        acc.push({ currentStep })
      }
      return acc
    },
    [] as { currentStep: number }[],
  )

  // Recalculate nextRunAt for each affected currentStep position
  // Use Promise.all for parallel processing to improve performance
  await Promise.all(
    allAffectedSteps.map(({ currentStep }) =>
      recalculateNextRunAtForStep(sequenceId, chatbotId, currentStep, client),
    ),
  )

  // PART 2: Handle COMPLETED contacts
  // When a step is updated (enabled, reordered, etc.) AFTER a contact's completion point,
  // we need to REACTIVATE them so they can continue the sequence
  // Example: Contact completed at step 4, admin enables step 5 → reactivate
  await reactivateCompletedContactsForNewStep(
    sequenceId,
    chatbotId,
    updatedStepOrder,
    client,
  )
}
