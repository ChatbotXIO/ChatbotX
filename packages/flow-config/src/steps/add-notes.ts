import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { StepType } from "./step-action"

export const addNotesStepSchema = z.object({
  id: z.cuid2(),
  stepType: z.literal(StepType.addNotes),
  content: z.string().trim().max(1000),
})

export type AddNotesStepSchema = z.infer<typeof addNotesStepSchema>

export const addNotesStepDefaultFn = (
  props?: Partial<AddNotesStepSchema>,
): AddNotesStepSchema => ({
  id: createId(),
  stepType: StepType.addNotes,
  content: "",
  ...props,
})
