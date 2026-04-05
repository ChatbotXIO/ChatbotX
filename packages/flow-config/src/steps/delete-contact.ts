import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const deleteContactStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.deleteContact),
})

export type DeleteContactStepSchema = z.infer<typeof deleteContactStepSchema>

export const deleteContactStepDefaultFn = (
  props?: Partial<DeleteContactStepSchema>,
): DeleteContactStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.deleteContact,
  ...props,
})
