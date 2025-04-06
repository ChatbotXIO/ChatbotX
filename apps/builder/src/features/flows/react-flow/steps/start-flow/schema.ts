import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "../step-action"

export const startFlowStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.StartFlow),
  flowId: z.string().cuid2(),
})

export type StartFlowStepSchema = z.infer<typeof startFlowStepSchema>

export const startFlowStepDefaultFn = (): StartFlowStepSchema => ({
  id: createId(),
  stepType: StepType.StartFlow,
  flowId: "",
})
