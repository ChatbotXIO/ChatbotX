import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const startAnotherNodeStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.startAnotherNode),
  nodeId: z.cuid2().nullable(),
  viewOnly: z.boolean().optional(),
})

export type StartAnotherNodeStepSchema = z.infer<
  typeof startAnotherNodeStepSchema
>

export const startAnotherNodeStepDefaultFn = (
  props?: Partial<StartAnotherNodeStepSchema>,
): StartAnotherNodeStepSchema => ({
  id: createId(),
  stepType: StepType.startAnotherNode,
  nodeId: null,
  ...props,
})
