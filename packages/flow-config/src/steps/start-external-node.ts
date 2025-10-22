import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const startExternalNodeStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.startExternalNode),
  flowId: z.cuid2().nullable(),
  nodeId: z.cuid2().nullable(),
})

export type StartExternalNodeStepSchema = z.infer<
  typeof startExternalNodeStepSchema
>

export const startExternalNodeStepDefaultFn = (
  props?: Partial<StartExternalNodeStepSchema>,
): StartExternalNodeStepSchema => ({
  id: createId(),
  stepType: StepType.startExternalNode,
  flowId: null,
  nodeId: null,
  ...props,
})
