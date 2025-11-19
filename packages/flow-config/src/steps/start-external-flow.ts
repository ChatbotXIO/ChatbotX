import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const startExternalFlowStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.startExternalFlow),
  flowId: z.cuid2().nullable(),
})

export type StartExternalFlowStepSchema = z.infer<
  typeof startExternalFlowStepSchema
>

export const startExternalFlowStepDefaultFn = (
  props?: Partial<StartExternalFlowStepSchema>,
): StartExternalFlowStepSchema => ({
  id: createId(),
  stepType: StepType.startExternalFlow,
  flowId: null,
  ...props,
})
