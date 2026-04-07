import { and, db, eq } from "@chatbotx.io/database/client"
import { contactsOnSequenceModel } from "@chatbotx.io/database/schema"
import type { SchedulerClient } from "@chatbotx.io/scheduler"
import {
  calculateNextRunAtFromStep,
  calculateNextValidSendTime,
  createDispatch,
  getContactInboxes,
} from "@chatbotx.io/sequence-scheduler"
import type { DispatchWithRelations, StepWithRelations } from "./types"

export class EnrollmentAdvancerService {
  async fetchEnrollment(enrollmentId: string, workspaceId: string) {
    const enrollment = await db.query.contactsOnSequenceModel.findFirst({
      where: {
        id: enrollmentId,
        workspaceId,
      },
    })

    return enrollment || null
  }

  async findNextStep(
    sequenceId: string,
    currentOrder: number,
  ): Promise<StepWithRelations | null> {
    const nextStep = await db.query.sequenceStepModel.findFirst({
      where: {
        sequenceId,
        order: { gt: currentOrder },
        isActive: true,
      },
      orderBy: { order: "asc" },
      with: { flow: true },
    })

    return nextStep || null
  }

  calculateNextRunAt(step: StepWithRelations, baseTime: Date): Date {
    const calculatedTime = calculateNextRunAtFromStep(
      {
        delayDays: step.delayDays,
        delayMinutes: step.delayMinutes,
        delayUnit: step.delayUnit,
        specificDateTime: step.specificDateTime,
      },
      baseTime,
    )

    const validSendTime = calculateNextValidSendTime(calculatedTime, {
      anytime: step.anytime,
      sendTimeStart: step.sendTimeStart,
      sendTimeEnd: step.sendTimeEnd,
      sendDays: step.sendDays,
    })

    return validSendTime
  }

  async completeEnrollment(
    enrollmentId: string,
    workspaceId: string,
    step: StepWithRelations,
    sentAt: Date,
  ): Promise<void> {
    await db
      .update(contactsOnSequenceModel)
      .set({
        status: "completed",
        completedAt: sentAt,
        currentStep: step.order + 1,
        lastStepId: step.id,
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
  }

  async advanceToNextStep(
    dispatch: DispatchWithRelations,
    currentStep: StepWithRelations,
    nextStep: StepWithRelations,
    sentAt: Date,
    scheduler: SchedulerClient,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const nextRunAt = this.calculateNextRunAt(nextStep, sentAt)

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
            eq(contactsOnSequenceModel.id, dispatch.enrollmentId),
            eq(contactsOnSequenceModel.workspaceId, dispatch.workspaceId),
          ),
        )

      const contactInboxes = await getContactInboxes(
        dispatch.workspaceId,
        dispatch.contactId,
      )

      for (const contactInbox of contactInboxes) {
        const nextDispatch = await createDispatch({
          workspaceId: dispatch.workspaceId,
          sequenceId: dispatch.sequenceId,
          contactId: dispatch.contactId,
          stepId: nextStep.id,
          enrollmentId: dispatch.enrollmentId,
          runAt: nextRunAt,
          client: tx,
          contactInboxId: contactInbox.id,
        })

        await scheduler.addToSchedule(
          nextDispatch.bucket,
          nextDispatch.id,
          nextDispatch.runAtMs,
        )
      }
    })
  }
}
