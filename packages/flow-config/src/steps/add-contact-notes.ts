import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { StepType } from "./step-action"

export const addContactNotesStepSchema = z.object({
  id: z.bigint(),
  stepType: z.literal(StepType.addContactNotes),
  content: z.string().trim().max(1000),
})

export type AddContactNotesStepSchema = z.infer<
  typeof addContactNotesStepSchema
>

export const addContactNotesStepDefaultFn = (
  props?: Partial<AddContactNotesStepSchema>,
): AddContactNotesStepSchema => ({
  id: createId(),
  stepType: StepType.addContactNotes,
  content: "",
  ...props,
})
