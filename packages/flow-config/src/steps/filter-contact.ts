import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const filterContactStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.filterContact),
  cases: z.array(
    z.object({
      field: z.string(),
      operator: z.string(),
      value: z.string(),
      nodeId: zodBigintAsString().nullish(),
    }),
  ),
  otherwiseNodeId: zodBigintAsString().nullish(),
})

export type FilterContactStepSchema = z.infer<typeof filterContactStepSchema>

export const filterContactStepDefaultFn = (
  props?: Partial<FilterContactStepSchema>,
): FilterContactStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.filterContact,
  cases: [],
  otherwiseNodeId: null,
  ...props,
})
