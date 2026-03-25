import { and, db, eq } from "@aha.chat/database/client"
import { contactsOnSequenceModel } from "@aha.chat/database/schema"
import type { SchedulerClient } from "@aha.chat/scheduler"
import {
  calculateNextRunAtFromStep,
  calculateNextValidSendTime,
  createDispatch,
} from "@aha.chat/sequence-scheduler"
import type { DispatchWithRelations, StepWithRelations } from "./types"

export class EnrollmentAdvancerService {
  async fetchEnrollment(enrollmentId: string, chatbotId: string) {
    const enrollment = await db.query.contactsOnSequenceModel.findFirst({
      where: {
        id: enrollmentId,
        chatbotId,
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
    chatbotId: string,
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
          eq(contactsOnSequenceModel.chatbotId, chatbotId),
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
            eq(contactsOnSequenceModel.chatbotId, dispatch.chatbotId),
          ),
        )

      const nextDispatch = await createDispatch({
        chatbotId: dispatch.chatbotId,
        sequenceId: dispatch.sequenceId,
        contactId: dispatch.contactId,
        stepId: nextStep.id,
        enrollmentId: dispatch.enrollmentId,
        runAt: nextRunAt,
        client: tx,
      })

      await scheduler.addToSchedule(
        nextDispatch.bucket,
        nextDispatch.id,
        nextDispatch.runAtMs,
      )
    })
  }
}
