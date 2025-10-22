import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const setCustomFieldStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.setCustomField),
  outputCfId: z.cuid2(),
  operation: z.enum(["set", "append", "prepend"]),
  value: z.string().trim().min(1),
})

export type SetCustomFieldStepSchema = z.infer<typeof setCustomFieldStepSchema>

export const setCustomFieldStepDefaultFn = (): SetCustomFieldStepSchema => ({
  id: createId(),
  stepType: StepType.setCustomField,
  value: "",
  outputCfId: "",
  operation: "set",
})
