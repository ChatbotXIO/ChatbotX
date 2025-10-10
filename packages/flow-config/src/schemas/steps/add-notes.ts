import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const addNotesStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.ADD_CONTACT_NOTES),
  content: z.string().trim().min(1).max(1000),
})

export type AddNotesStepSchema = z.infer<typeof addNotesStepSchema>

export const addNotesStepDefaultFn = (): AddNotesStepSchema => ({
  id: createId(),
  stepType: StepType.ADD_CONTACT_NOTES,
  content: "",
})
