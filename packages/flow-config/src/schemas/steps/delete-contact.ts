import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const deleteContactStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.DELETE_CONTACT),
})

export type DeleteContactStepSchema = z.infer<typeof deleteContactStepSchema>

export const deleteContactStepDefaultFn = (): DeleteContactStepSchema => ({
  id: createId(),
  stepType: StepType.DELETE_CONTACT,
})
