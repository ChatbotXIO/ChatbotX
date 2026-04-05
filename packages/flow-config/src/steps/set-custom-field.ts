import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

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
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.setCustomField),
  inputCfId: zodBigintAsString(),
  operation: z.enum(FieldOperationType),
  value: z.string().trim(),
})

export type SetCustomFieldStepSchema = z.infer<typeof setCustomFieldStepSchema>

export const setCustomFieldStepDefaultFn = (): SetCustomFieldStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.setCustomField,
  value: "",
  inputCfId: "",
  operation: FieldOperationType.set,
})
