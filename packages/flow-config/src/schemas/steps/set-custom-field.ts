import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const setCustomFieldStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.SET_CUSTOM_FIELD),
  outputCFId: z.cuid2(),
  operation: z.enum(["set", "append", "prepend"]),
  value: z.string().trim().min(1),
})

export type SetCustomFieldStepSchema = z.input<typeof setCustomFieldStepSchema>

export const setCustomFieldStepDefaultFn = (): SetCustomFieldStepSchema => ({
  id: createId(),
  stepType: StepType.SET_CUSTOM_FIELD,
  value: "",
  outputCFId: "",
  operation: "set",
})
