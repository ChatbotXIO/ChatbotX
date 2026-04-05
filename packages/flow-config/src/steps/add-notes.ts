import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const addNotesStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.addNotes),
  text: z.string().trim().max(1000),
})

export type AddNotesStepSchema = z.infer<typeof addNotesStepSchema>

export const addNotesStepDefaultFn = (
  props?: Partial<AddNotesStepSchema>,
): AddNotesStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.addNotes,
  text: "",
  ...props,
})
