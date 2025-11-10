import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const filterContactStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.filterContact),
  cases: z.array(
    z.object({
      field: z.string(),
      operator: z.string(),
      value: z.string(),
      nodeId: z.cuid2().nullish(),
    }),
  ),
  otherwiseNodeId: z.cuid2().nullish(),
})

export type FilterContactStepSchema = z.infer<typeof filterContactStepSchema>

export const filterContactStepDefaultFn = (
  props?: Partial<FilterContactStepSchema>,
): FilterContactStepSchema => ({
  id: createId(),
  stepType: StepType.filterContact,
  cases: [],
  otherwiseNodeId: null,
  ...props,
})
