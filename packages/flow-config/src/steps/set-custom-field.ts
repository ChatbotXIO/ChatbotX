import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const FieldOperationType = {
  set: "O01",
  append: "O02",
  prepend: "O03",
  increase: "O04",
  decrease: "O05",
} as const
export type FieldOperationType =
  (typeof FieldOperationType)[keyof typeof FieldOperationType]

export const setCustomFieldStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.setCustomField),
  inputCfId: z.bigint(),
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
