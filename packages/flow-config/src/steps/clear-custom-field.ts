import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const clearCustomFieldStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.clearCustomField),
  inputCfId: z.string().trim(),
})

export type ClearCustomFieldStepSchema = z.infer<
  typeof clearCustomFieldStepSchema
>

export const clearCustomFieldStepDefaultFn = (
  props?: Partial<ClearCustomFieldStepSchema>,
): ClearCustomFieldStepSchema => ({
  id: createId(),
  stepType: StepType.clearCustomField,
  inputCfId: "",
  ...props,
})
