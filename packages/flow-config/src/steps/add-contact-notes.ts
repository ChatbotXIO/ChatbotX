import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const addContactNotesStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.addContactNotes),
  content: z.string().trim().max(1000),
})

export type AddContactNotesStepSchema = z.infer<
  typeof addContactNotesStepSchema
>

export const addContactNotesStepDefaultFn = (
  props?: Partial<AddContactNotesStepSchema>,
): AddContactNotesStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.addContactNotes,
  content: "",
  ...props,
})
