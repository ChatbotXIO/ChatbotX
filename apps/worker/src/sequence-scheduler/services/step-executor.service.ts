import { and, db, eq } from "@aha.chat/database/client"
import {
  sequenceDispatchModel,
  sequenceEventModel,
} from "@aha.chat/database/schema"
import { createId } from "@paralleldrive/cuid2"
import { sendFlowDirect } from "../../integration/handlers/send-flow-direct"
import type {
  DispatchWithRelations,
  SequenceEventType,
  StepWithRelations,
  ValidationResult,
} from "./types"

export class StepExecutorService {
  async fetchStep(stepId: string) {
    const step = await db.query.sequenceStepModel.findFirst({
      where: {
        id: stepId,
      },
      with: { flow: true },
    })

    return step ?? null
  }

  validateStep(
    step: Awaited<ReturnType<typeof this.fetchStep>>,
  ): ValidationResult {
    if (!step) {
      return { valid: false, reason: "step_not_found" }
    }

    if (!step.isActive) {
      return { valid: false, reason: "step_inactive" }
    }

    if (!step.flow) {
      return { valid: false, reason: "flow_not_configured" }
    }

    return { valid: true }
  }

  async sendFlowMessage(
    dispatch: DispatchWithRelations,
    step: StepWithRelations,
  ): Promise<Date> {
    if (!step.flow) {
      throw new Error(`Step ${step.id} has no flow configured`)
    }

    const sentAt = await sendFlowDirect({
      flowId: step.flow.id,
      chatbotId: dispatch.chatbotId,
      contactId: dispatch.contactId,
    })

    return sentAt
  }

  async markDispatchCompleted(
    dispatchId: string,
    chatbotId: string,
    sentAt: Date,
  ): Promise<void> {
    await db
      .update(sequenceDispatchModel)
      .set({
        status: "completed",
        completedAt: sentAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sequenceDispatchModel.id, dispatchId),
          eq(sequenceDispatchModel.chatbotId, chatbotId),
        ),
      )
  }

  async recordDispatchEvent(
    dispatch: DispatchWithRelations,
    eventType: SequenceEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(sequenceEventModel).values({
      id: createId(),
      chatbotId: dispatch.chatbotId,
      sequenceId: dispatch.sequenceId,
      contactId: dispatch.contactId,
      stepId: dispatch.stepId,
      dispatchId: dispatch.id,
      eventType,
      payload,
      occurredAt: new Date(),
    })
  }
}
