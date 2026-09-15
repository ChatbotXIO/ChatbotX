import type { SequenceStepWithFlow } from "@chatbotx.io/database/repositories"
import { sequenceDispatchRepository } from "@chatbotx.io/database/repositories"

export type StepWithFlow = SequenceStepWithFlow
export type StepWithConfiguredFlow = StepWithFlow & {
  flow: NonNullable<StepWithFlow["flow"]>
}

export type StepValidationResult =
  | { valid: true; step: StepWithConfiguredFlow }
  | { valid: false; reason: string }

export class StepExecutorService {
  async fetchStep(stepId: string) {
    return await sequenceDispatchRepository.findStepWithFlow({ id: stepId })
  }

  validateStep(step: StepWithFlow | undefined): StepValidationResult {
    if (!step) {
      return { valid: false, reason: "step_not_found" }
    }

    if (!step.isActive) {
      return { valid: false, reason: "step_inactive" }
    }

    if (!step.flow) {
      return { valid: false, reason: "flow_not_configured" }
    }

    return { valid: true, step: step as StepWithConfiguredFlow }
  }
}
