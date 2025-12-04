import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const FieldOperationType = {
  set: "O01",
  append: "O02",
  prepend: "O03",
} as const
export type FieldOperationType =
  (typeof FieldOperationType)[keyof typeof FieldOperationType]

export const setCustomFieldStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.setCustomField),
  inputCfId: z.cuid2(),
  operation: z.enum(FieldOperationType),
  value: z.string().trim(),
})

export type SetCustomFieldStepSchema = z.infer<typeof setCustomFieldStepSchema>

export const setCustomFieldStepDefaultFn = (): SetCustomFieldStepSchema => ({
  id: createId(),
  stepType: StepType.setCustomField,
  value: "",
  inputCfId: "",
  operation: FieldOperationType.set,
})
