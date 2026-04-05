import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const addContactTagStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.addContactTag),
  tags: z.array(z.string().trim().min(1)).min(1),
})

export type AddContactTagStepSchema = z.infer<typeof addContactTagStepSchema>

export const addContactTagStepDefaultFn = (
  props?: Partial<AddContactTagStepSchema>,
): AddContactTagStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.addContactTag,
  tags: [],
  ...props,
})
