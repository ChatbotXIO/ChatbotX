import { and, asc, db, eq, gt } from "@chatbotx.io/database/client"
import {
  contactsOnSequenceModel,
  sequenceStepModel,
} from "@chatbotx.io/database/schema"
import type { SchedulerClient } from "@chatbotx.io/scheduler"
import { calculateNextRunAtFromStep } from "./calculate-next-run-at"
import { getContactInboxes } from "./contacts-on-sequences"
import { createDispatch } from "./dispatch-manager"
import { calculateNextValidSendTime } from "./send-time-validator"

type NextStepForSchedule = {
  id: string
  order: number
  delayDays: number
  delayMinutes: number
  delayUnit: string | null
  specificDateTime: Date | null
  anytime: boolean
  sendTimeStart: string | null
  sendTimeEnd: string | null
  sendDays: string | null
}

function calculateNextRunAt(step: NextStepForSchedule, baseTime: Date): Date {
  const calculatedTime = calculateNextRunAtFromStep(
    {
      delayDays: step.delayDays,
      delayMinutes: step.delayMinutes,
      delayUnit: step.delayUnit,
      specificDateTime: step.specificDateTime,
    },
    baseTime,
  )

  return calculateNextValidSendTime(calculatedTime, {
    anytime: step.anytime,
    sendTimeStart: step.sendTimeStart,
    sendTimeEnd: step.sendTimeEnd,
    sendDays: step.sendDays,
  })
}

export interface AdvanceEnrollmentParams {
  contactId: string
  currentStep: { id: string; order: number }
  enrollmentId: string
  scheduler: SchedulerClient
  sentAt: Date
  sequenceId: string
  workspaceId: string
}

export async function advanceEnrollment(
  params: AdvanceEnrollmentParams,
): Promise<void> {
  const {
    enrollmentId,
    workspaceId,
    sequenceId,
    contactId,
    currentStep,
    sentAt,
    scheduler,
  } = params

  const enrollment = await db.query.contactsOnSequenceModel.findFirst({
    where: { id: enrollmentId, workspaceId },
  })

  if (!enrollment) {
    throw new Error(`Enrollment ${enrollmentId} not found`)
  }

  if (enrollment.status !== "active") {
    return
  }

  if (enrollment.lastStepId === currentStep.id) {
    return
  }

  const [nextStep] = await db
    .select()
    .from(sequenceStepModel)
    .where(
      and(
        eq(sequenceStepModel.sequenceId, sequenceId),
        gt(sequenceStepModel.order, currentStep.order),
        eq(sequenceStepModel.isActive, true),
      ),
    )
    .orderBy(asc(sequenceStepModel.order))
    .limit(1)

  if (!nextStep) {
    await db
      .update(contactsOnSequenceModel)
      .set({
        status: "completed",
        completedAt: sentAt,
        currentStep: currentStep.order + 1,
        lastStepId: currentStep.id,
        nextStepId: null,
        nextRunAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactsOnSequenceModel.id, enrollmentId),
          eq(contactsOnSequenceModel.workspaceId, workspaceId),
        ),
      )
    return
  }

  await db.transaction(async (tx) => {
    const nextRunAt = calculateNextRunAt(nextStep, sentAt)

    await tx
      .update(contactsOnSequenceModel)
      .set({
        currentStep: nextStep.order,
        lastStepId: currentStep.id,
        nextStepId: nextStep.id,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactsOnSequenceModel.id, enrollmentId),
          eq(contactsOnSequenceModel.workspaceId, workspaceId),
        ),
      )

    const contactInboxes = await getContactInboxes(workspaceId, contactId)

    for (const contactInbox of contactInboxes) {
      const nextDispatch = await createDispatch({
        workspaceId,
        sequenceId,
        contactId,
        stepId: nextStep.id,
        enrollmentId,
        runAt: nextRunAt,
        client: tx,
        contactInboxId: contactInbox.id,
      })

      await scheduler.addToSchedule(
        nextDispatch.bucket,
        nextDispatch.id,
        Number(nextDispatch.runAtMs),
      )
    }
  })
}
