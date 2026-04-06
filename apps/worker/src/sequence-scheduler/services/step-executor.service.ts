import { and, db, eq } from "@chatbotx.io/database/client"
import { sequenceDispatchModel } from "@chatbotx.io/database/schema"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import { sendFlowDirect } from "../../integration/handlers/send-flow-direct"
import type {
  DispatchWithRelations,
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
    options?: {
      metadata?: MetadataPayload
    },
  ): Promise<Date> {
    if (!step.flow) {
      throw new Error(`Step ${step.id} has no flow configured`)
    }

    const sentAt = await sendFlowDirect({
      flowId: step.flow.id,
      workspaceId: dispatch.workspaceId,
      contactId: dispatch.contactId,
      metadata: options?.metadata,
    })

    return sentAt
  }

  async markDispatchCompleted(
    dispatchId: string,
    workspaceId: string,
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
          eq(sequenceDispatchModel.workspaceId, workspaceId),
        ),
      )
  }
}
