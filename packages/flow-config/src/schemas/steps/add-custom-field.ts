import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const addCustomFieldStepSchema = z.object({
  id: z.string().cuid2(),
  stepType: z.literal(StepType.ADD_CUSTOM_FIELD),
  customFieldId: z.string().cuid2(),
  operation: z.enum(["set", "append", "prepend"]),
  value: z.string().trim(),
})

export type AddCustomFieldStepSchema = z.infer<typeof addCustomFieldStepSchema>

export const addCustomFieldStepDefaultFn = (): AddCustomFieldStepSchema => ({
  id: createId(),
  stepType: StepType.ADD_CUSTOM_FIELD,
  value: "",
  customFieldId: "",
  operation: "set",
})
