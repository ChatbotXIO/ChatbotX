import { db } from "@chatbotx.io/database/client"

type StepQueryResult = Awaited<
  ReturnType<
    typeof db.query.sequenceStepModel.findFirst<{ with: { flow: true } }>
  >
>

export type StepWithFlow = NonNullable<StepQueryResult>

export type StepValidationResult =
  | { valid: true; step: StepWithFlow }
  | { valid: false; reason: string }

export class StepExecutorService {
  async fetchStep(stepId: string) {
    const step = await db.query.sequenceStepModel.findFirst({
      where: {
        id: stepId,
      },
      with: { flow: true },
    })

    return step
  }

  validateStep(step: StepQueryResult): StepValidationResult {
    if (!step) {
      return { valid: false, reason: "step_not_found" }
    }

    if (!step.isActive) {
      return { valid: false, reason: "step_inactive" }
    }

    if (!step.flow) {
      return { valid: false, reason: "flow_not_configured" }
    }

    return { valid: true, step }
  }
}
