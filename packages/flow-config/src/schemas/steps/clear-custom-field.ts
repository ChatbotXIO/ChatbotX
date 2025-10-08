import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const clearCustomFieldStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.CLEAR_CUSTOM_FIELD),
  inputCFId: z.string().trim(),
})

export type ClearCustomFieldStepSchema = z.infer<
  typeof clearCustomFieldStepSchema
>

export const clearCustomFieldStepDefaultFn =
  (): ClearCustomFieldStepSchema => ({
    id: createId(),
    stepType: StepType.CLEAR_CUSTOM_FIELD,
    inputCFId: "",
  })
